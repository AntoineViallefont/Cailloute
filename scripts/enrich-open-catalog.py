"""Prépare un lot à valider ; aucune écriture Firebase ni modification du catalogue.

Sources liées par identifiant OSM/Wikidata, jamais par simple ressemblance du nom.
Les originaux Commons restent dans le dossier de travail et ne sont jamais diffusés.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import ipaddress
import json
import math
import re
import time
import csv
import io
import zipfile
import unicodedata
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "donnees/enrichissement-ouvert"
HEADERS = {"User-Agent": "CaillouteCatalog/1.0 (local open-data catalogue preparation)"}
TEXT_LIMITS = {"hours": 500, "website": 300, "description": 2000, "age": 100}
TRI_FIELDS = {"wheelchair": "wheelchair", "changing_table": "changing_table",
              "fee": "free", "organic": "organic", "drinking_water": "drinking_water"}
ALLOWED_HOSTS = {"www.wikidata.org", "commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"}


def plain(value):
    # Les descriptions culturelles sont parfois des listes encodées en JSON.
    for _ in range(4):
        if not isinstance(value, str) or not value.strip().startswith(('[', '"')):
            break
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            break
    if isinstance(value, list):
        return "\n\n".join(dict.fromkeys(plain(part) for part in value if part))
    return html.unescape(re.sub(r"<[^>]*>", "", str(value or ""))).strip()


def missing(value):
    # False et zéro sont des informations explicites.
    return value is None or isinstance(value, str) and not value.strip()


TOURISM_PLACEHOLDER = "Vérifiez auprès du lieu les âges, horaires et conditions d’accès."


def missing_field(place, field):
    return missing(place.get(field)) or field == "description" and place.get(field) == TOURISM_PLACEHOLDER


def public_description(value):
    text = re.sub(r"\s+", " ", plain(value)).strip()
    # Ne pas redistribuer un contact individuel présent dans un texte touristique.
    if re.search(r"[\w.+-]+@[\w.-]+\.\w+|(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}", text):
        return ""
    if len(text) > 2000:
        text = text[:2000].rsplit(" ", 1)[0]
    return text if len(text) >= 15 else ""


def distance(a, b):
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    angle = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b["lon"]-a["lon"])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(angle)))


def safe_website(value):
    value = str(value or "").strip()
    if not value or re.search(r"\s", value):
        return ""
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", value) and not value.startswith(("https://", "http://")):
        return ""
    if not value.startswith(("https://", "http://")):
        value = "https://" + value
    url = urllib.parse.urlparse(value)
    if url.scheme not in ("https", "http") or not url.hostname or url.username or url.password:
        return ""
    if url.hostname in ("localhost", "127.0.0.1", "::1") or "." not in url.hostname:
        return ""
    try:
        if not ipaddress.ip_address(url.hostname).is_global:
            return ""
    except ValueError:
        pass
    return value if len(value) <= 300 else ""


def osm_patch(place, tags):
    patch = {}
    for field, key in (("hours", "opening_hours"), ("website", "website")):
        value = safe_website(tags.get(key)) if field == "website" else str(tags.get(key) or "").strip()
        if missing(place.get(field)) and value and len(value) <= TEXT_LIMITS[field]:
            patch[field] = value
    description = public_description(tags.get("description:fr") or tags.get("description"))
    if missing_field(place, "description") and description:
        patch["description"] = description
    for key, field in TRI_FIELDS.items():
        value = tags.get(key)
        if missing(place.get(field)) and value in ("yes", "no", "only"):
            if value == "only" and key != "organic":
                continue
            patch[field] = value == "no" if key == "fee" else value != "no"
    if place.get("category") in ("playground", "child_activity") and missing(place.get("age")):
        low, high = tags.get("min_age"), tags.get("max_age")
        valid = lambda v: v is not None and re.fullmatch(r"\d{1,2}(?:[.,]\d{1,2})?", str(v))
        if valid(low) and valid(high) and float(str(low).replace(",", ".")) <= float(str(high).replace(",", ".")):
            patch["age"] = f"{low}–{high} ans"
        elif valid(low) and high is None:
            patch["age"] = f"À partir de {low} ans"
        elif valid(high) and low is None:
            patch["age"] = f"Jusqu’à {high} ans"
    return patch


def values(entity, property_id):
    return [statement["mainsnak"]["datavalue"]["value"]
            for statement in entity.get("claims", {}).get(property_id, [])
            if statement.get("rank") != "deprecated" and "datavalue" in statement.get("mainsnak", {})
            and not statement.get("qualifiers", {}).get("P582")]


def linked_entity(place, entity):
    # Les personnes, marques/chaînes et photos d'un parc attribuées à son jeu sont exclues.
    if any(isinstance(value, dict) and value.get("id") == "Q5" for value in values(entity, "P31")):
        return False
    coordinates = [c for c in values(entity, "P625") if isinstance(c, dict)
                   and c.get("globe") == "http://www.wikidata.org/entity/Q2"]
    if len(coordinates) != 1:
        return False
    coord = coordinates[0]
    if not all(isinstance(coord.get(k), (float, int)) and math.isfinite(coord[k]) for k in ("latitude", "longitude")):
        return False
    if not -90 <= coord["latitude"] <= 90 or not -180 <= coord["longitude"] <= 180:
        return False
    if distance(place, {"lat": coord["latitude"], "lon": coord["longitude"]}) > 250:
        return False
    description = entity.get("descriptions", {}).get("fr", {}).get("value", "").casefold()
    if re.search(r"\b(?:chaîne|entreprise|société|marque|réseau de transports|réseau ferroviaire)\b", description):
        return False
    patterns = {"transit": r"\b(gare|station|arrêt)\b", "playground": r"aire de jeux|terrain de jeux",
                "child_activity": r"musée|bibliothèque|cinéma|piscine|parc|jardin|zoo|aquarium",
                "food_shop": r"supermarché|hypermarché|épicerie|magasin", "baby_shop": r"\bmagasin\b", "health":r"\bpharmacie\b|hôpital|clinique|service d.urgences", "water":r"fontaine|source d.eau|point d.eau", "toilet": r"toilettes"}
    return bool(re.search(patterns.get(place.get("category"), r"(?!)"), description))


def standard_thumbnail(info):
    if info.get("thumburl"):
        return info["thumburl"]
    original = info.get("url", "")
    parsed = urllib.parse.urlparse(original)
    match = re.fullmatch(r"/wikipedia/commons/([0-9a-f]/[0-9a-f]{2})/([^/]+\.(?:jpe?g|png))", parsed.path, re.I)
    if parsed.scheme == "https" and parsed.hostname == "upload.wikimedia.org" and match and info.get("width", 0) > 960:
        # Taille standard Commons documentée, sans demander un rendu dans l'appel de métadonnées.
        return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{match[1]}/{match[2]}/960px-{match[2]}"
    return original


def licensed_photo(info):
    metadata = info.get("extmetadata", {})
    get = lambda key: plain(metadata.get(key, {}).get("value"))
    license_name, license_url = get("LicenseShortName"), get("LicenseUrl")
    public = license_name in ("Public domain", "CC0")
    creative = bool(re.fullmatch(r"CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)", license_name))
    # Contrôle de l'URL en plus de l'étiquette : pas de licence NC/ND/inconnue.
    match = re.fullmatch(r"https?://creativecommons\.org/licenses/(by|by-sa)/(1\.0|2\.0|2\.5|3\.0|4\.0)/?", license_url)
    if creative and (not match or license_name != f"CC {match[1].upper()} {match[2]}"):
        return None
    if not public and not creative or get("Restrictions") or not get("Artist"):
        return None
    page = info.get("descriptionurl", "")
    image = standard_thumbnail(info)
    if urllib.parse.urlparse(page).hostname != "commons.wikimedia.org" or urllib.parse.urlparse(image).hostname not in {"upload.wikimedia.org", "thumb.wikimedia.org"}:
        return None
    if public:
        license_url = "https://creativecommons.org/publicdomain/zero/1.0/" if license_name == "CC0" else "https://commons.wikimedia.org/wiki/Commons:Public_domain"
    return {"author": get("Artist"), "license": license_name, "licenseUrl": license_url,
            "sourceUrl": page, "downloadUrl": image,
            "modifications": "Floutage éventuel, redimensionnement et conversion WebP."}


class Fetcher:
    def __init__(self, folder):
        self.cache = folder / "cache"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.calls = 0
        self.mutex = threading.Lock()
        self.locks = {}
        self.entities = folder / "entities"
        self.entities.mkdir(exist_ok=True)

    def fetch(self, url, maximum=8_000_000):
        # Deux téléchargements maximum ; la même URL ne s'écrit jamais en concurrence.
        with self.mutex:
            lock = self.locks.setdefault(url, threading.Lock())
        with lock:
            return self._fetch(url, maximum)

    def _fetch(self, url, maximum=8_000_000):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError("Hôte source non autorisé")
        key = hashlib.sha256(url.encode()).hexdigest()
        path = self.cache / key
        if path.exists():
            data = path.read_bytes()
            if len(data) <= maximum:
                return data
            raise ValueError("Source en cache trop volumineuse")
        for attempt in range(4):
            if self.calls:
                time.sleep(1)
            self.calls += 1
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
                    if urllib.parse.urlparse(response.url).hostname not in ALLOWED_HOSTS:
                        raise ValueError("Redirection source refusée")
                    data = response.read(maximum + 1)
                break
            except urllib.error.HTTPError as error:
                if error.code not in (429, 503) or attempt == 3 or error.code == 429 and parsed.hostname == "upload.wikimedia.org":
                    raise
                retry = error.headers.get("Retry-After", "")
                delay = max(3 * (attempt + 1), min(30, int(retry))) if retry.isdigit() else 3 * (attempt + 1)
                time.sleep(delay)
        if len(data) > maximum:
            raise ValueError("Source trop volumineuse")
        temporary = path.with_suffix(".part")
        temporary.write_bytes(data)
        temporary.replace(path)
        return data

    def api(self, host, **params):
        url = f"https://{host}/w/api.php?" + urllib.parse.urlencode({"format": "json", **params})
        data = json.loads(self.fetch(url))
        if "error" in data:
            raise ValueError("La source a refusé la requête")
        return data


def catalog_places(root):
    # Les fiches fusionnées publiées priment sur leurs anciennes entrées individuelles.
    canonical = json.loads((root / "app/public/canonical-places.json").read_text())
    aliases = {original["id"]: group["id"] for group in canonical["groups"] for original in group["originals"]}
    places = {group["id"]: group["place"] for group in canonical["groups"]}
    files = [root / "app/public/seed.json", *sorted((root / "app/public").glob("catalog-*.json")),
             *sorted((root / "app/public/france").glob("*.json"))]
    for path in files:
        if path.name == "index.json":
            continue
        rows = json.loads(path.read_text())
        if not isinstance(rows, list):
            continue
        for place in rows:
            if place["id"] not in aliases:
                places.setdefault(place["id"], place)
    # Même état initial que celui affiché dans l'application, compléments publiés inclus.
    extras = [json.loads((root / f"app/src/{name}").read_text()) for name in ("data-enrichment-017.json", "data-family-enrichment-017.json")]
    for ident, place in places.items():
        extra = {**extras[0].get(ident, {}), **extras[1].get(ident, {})}
        for field in ("organic", "toilet_public", "changing_table", "wheelchair", "free"):
            if place.get(field) is None and field in extra:
                place[field] = extra[field]
    return places


def geojson_features(stream):
    """Lit les gros exports sans charger leur géométrie nationale en mémoire."""
    decoder, buffer, started, ended = json.JSONDecoder(), "", False, False
    while not ended:
        chunk = stream.read(65_536)
        buffer += chunk
        if not started:
            match = re.search(r'"features"\s*:\s*\[', buffer)
            if not match:
                if not chunk:
                    raise ValueError("Export sans tableau features")
                continue
            buffer, started = buffer[match.end():], True
        while True:
            buffer = buffer.lstrip(" \r\n\t,")
            if buffer.startswith("]"):
                ended = True
                break
            try:
                feature, offset = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                break
            yield feature
            buffer = buffer[offset:]
        if not chunk and not ended:
            raise ValueError("Export GeoJSON tronqué")


def normalized_name(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode().casefold())


def strict_place_match(element, nearby):
    tags = element.get("tags", {})
    coordinate = element if "lat" in element else element.get("center", {})
    if not all(isinstance(coordinate.get(k), (int, float)) for k in ("lat", "lon")):
        return None
    name = normalized_name(tags.get("name", ""))
    if len(name) < 5:
        return None
    subtype = tags.get("tourism") or tags.get("leisure") or tags.get("amenity")
    activity = {"museum": "musée", "library":"bibliothèque", "cinema":"cinéma", "park":"parc", "garden":"jardin", "zoo":"zoo", "aquarium":"aquarium", "theme_park":"parc", "water_park":"aquatique", "swimming_pool":"piscine"}.get(subtype)
    railway = tags.get("railway") == "station"
    allowed = []
    for place in nearby:
        compatible = activity and place.get("category") == "child_activity" and activity in str(place.get("activity_type", "")).casefold()
        compatible = compatible or railway and place.get("category") == "transit" and "train" in place.get("transit_modes", []) and tags.get("station") != "subway"
        if compatible and normalized_name(place.get("name", "")) == name and distance(place, coordinate) <= 30:
            allowed.append(place)
    return allowed[0] if len(allowed) == 1 else None


def national_osm_elements(root):
    # Chaque export porte une licence ODbL et un identifiant OSM précis.
    for theme in ("toilets", "drinking_water", "playground", "healthcare", "library", "cinema", "sports", "shop_craft_office"):
        path = root / f"donnees/france/{theme}.zip"
        if not path.exists():
            raise FileNotFoundError(path)
        with zipfile.ZipFile(path) as archive, archive.open("data.geojson") as data:
            for feature in geojson_features(io.TextIOWrapper(data, encoding="utf-8")):
                props = feature.get("properties", {})
                ident = props.get("osm_id", "")
                if "/" in ident:
                    kind, number = ident.split("/", 1)
                    yield {"type": kind, "id": number, "tags": props}
    for name in ("osm_lyon_30km.json", "osm-familles-017.json"):
        raw = json.loads((root / "donnees/sources" / name).read_text())
        yield from raw.get("elements", [])
    for name in ("national-osm-links.json", "national-stations-links.json", "national-museums-links.json", "national-family-links.json", "national-services-links.json"):
        linked = root / "donnees/enrichissement-ouvert" / name
        if linked.exists():
            for element in json.loads(linked.read_text())["elements"]:
                yield {**element, "retrieved_at": datetime.now(timezone.utc).isoformat()}



def collect(root, out, limit=None, photo_limit=None):
    out.mkdir(parents=True, exist_ok=True)
    (out / "originals").mkdir(exist_ok=True)
    fetcher = Fetcher(out)
    places = catalog_places(root)
    places_scanned = len(places)
    candidates, linked, linked_sources, by_source, unresolved = {}, {}, {}, {}, {}
    today = datetime.now(timezone.utc).isoformat()
    for place in places.values():
        if place.get("community") or place.get("deleted") or place.get("withdrawn") or place.get("redirect"):
            continue
        for source in place.get("sources", []):
            by_source.setdefault(source["key"], {})[place["id"]] = (place, source)
    cells, names = {}, {}
    for place in places.values():
        if place.get("category") == "child_activity" or place.get("category") == "transit" and "train" in place.get("transit_modes", []):
            cells.setdefault((math.floor(place["lat"]*2000), math.floor(place["lon"]*2000)), []).append(place)
            names.setdefault(normalized_name(place["name"]), []).append(place)
    matched, raw_count, strict_matches = set(), 0, 0
    for element in national_osm_elements(root):
        raw_count += 1
        key = f"osm:{element['type']}/{element['id']}"
        matches = list(by_source.get(key, {}).values())
        coordinate = element if "lat" in element else element.get("center", {})
        if not matches and element.get("retrieved_at") and "lat" in coordinate and "lon" in coordinate:
            y, x = math.floor(coordinate["lat"]*2000), math.floor(coordinate["lon"]*2000)
            nearby = [p for dy in (-1,0,1) for dx in (-1,0,1) for p in cells.get((y+dy,x+dx), [])]
            place = strict_place_match(element, nearby)
            if place and not place.get("community") and not place.get("deleted") and not place.get("withdrawn") and not place.get("redirect"):
                source = {"key":key,"name":"OpenStreetMap","url":f"https://www.openstreetmap.org/{element['type']}/{element['id']}","license":"ODbL 1.0","retrieved_at":element["retrieved_at"]}
                matches = [(place,source)]
                strict_matches += 1
        if not matches and element.get("retrieved_at") and not coordinate:
            qid = element.get("tags", {}).get("wikidata", "")
            named = names.get(normalized_name(element.get("tags", {}).get("name", "")), [])
            if named and re.fullmatch(r"Q[1-9]\d*", str(qid)):
                unresolved.setdefault(qid, []).append((element, named, key))
                linked.setdefault(qid, {})
        for place, source in matches:
            if element.get("retrieved_at"):
                source = {**source,"retrieved_at":element["retrieved_at"]}
            matched.add(place["id"])
            tags = element.get("tags", {})
            patch = osm_patch(place, tags)
            if patch:
                candidate = candidates.setdefault(place["id"], {"place": place, "patch": {}, "sources": []})
                for field, value in patch.items():
                    if field in candidate["patch"] and candidate["patch"][field] != value:
                        candidate.setdefault("conflicts", []).append(field)
                    candidate["patch"][field] = value
                candidate["sources"].append(source)
            qid = tags.get("wikidata", "")
            if re.fullmatch(r"Q[1-9]\d*", str(qid)):
                linked.setdefault(qid, {})[place["id"]] = place
                linked_sources.setdefault(qid, {})[place["id"]] = source
    print(json.dumps({"phase":"national-osm", "rawElements":raw_count,"matchedPlaces":len(matched),"wikidataIds":len(linked),"strictAdditionalMatches":strict_matches}),flush=True)
    tourism_file = root / "donnees/france/datatourisme-place.csv"
    tourism_matched = 0
    with tourism_file.open() as stream:
        for record in csv.DictReader(stream):
            matches = by_source.get(record["URI_ID_du_POI"], {})
            for place, source in matches.values():
                tourism_matched += 1
                description = public_description(record.get("Description"))
                if description and missing_field(place, "description"):
                    row = candidates.setdefault(place["id"], {"place": place, "patch": {}, "sources": []})
                    row["patch"].setdefault("description", description)
                    row["sources"].append(source)
    culture_matched = 0
    with (root / "donnees/france/lieux-culturels-039.csv").open(encoding="utf-8-sig", newline="") as stream:
        for record in csv.DictReader(stream, delimiter=";"):
            for place, source in by_source.get("culture:"+record["id"], {}).values():
                culture_matched += 1
                description = public_description(record.get("description"))
                if description and missing_field(place, "description"):
                    row = candidates.setdefault(place["id"], {"place": place, "patch": {}, "sources": []})
                    row["patch"].setdefault("description", description)
                    row["sources"].append(source)
    print(json.dumps({"phase":"national-tourism","matchedPlaces":tourism_matched,"cultureMatchedPlaces":culture_matched}),flush=True)
    for candidate in candidates.values():
        for key in candidate.pop("conflicts", []):
            candidate["patch"].pop(key, None)
    previous = json.loads((out / "candidates.json").read_text()) if (out / "candidates.json").exists() else {"candidates":[]}
    previous_photos = {c["place"]["id"]: c["photo"] for c in previous["candidates"] if c.get("photo")}
    failures, photos = [], 0
    ids = list(linked) if limit is None else list(linked)[:limit]
    entities = {}
    for qid in ids:
        cached = fetcher.entities / f"{qid}.json"
        if cached.exists():
            entities[qid] = json.loads(cached.read_text())
    pending_ids = [qid for qid in ids if qid not in entities]
    for start in range(0, len(pending_ids), 50):
        batch = pending_ids[start:start+50]
        try:
            received = fetcher.api("www.wikidata.org", action="wbgetentities", ids="|".join(batch), props="claims|descriptions", languages="fr").get("entities", {})
            entities.update(received)
            for qid, entity in received.items():
                (fetcher.entities / f"{qid}.json").write_text(json.dumps(entity, ensure_ascii=False))
        except Exception as error:
            failures.append({"reason": "Lot Wikidata indisponible : " + str(error)[:150], "ids": batch})
        print(json.dumps({"phase":"wikidata","processed":min(start+50,len(pending_ids)),"total":len(pending_ids)}),flush=True)
    for qid, tasks in unresolved.items():
        entity = entities.get(qid, {})
        coordinates = [c for c in values(entity, "P625") if isinstance(c, dict) and c.get("globe") == "http://www.wikidata.org/entity/Q2"]
        if len(coordinates) != 1:
            continue
        coord = coordinates[0]
        if not all(isinstance(coord.get(k), (int, float)) and math.isfinite(coord[k]) for k in ("latitude", "longitude")):
            continue
        for element, named, key in tasks:
            located = {**element,"lat":coord["latitude"],"lon":coord["longitude"]}
            place = strict_place_match(located, named)
            if not place or not linked_entity(place, entity) or any(place.get(k) for k in ("community","deleted","withdrawn","redirect")):
                continue
            linked[qid][place["id"]] = place
            source = {"key":key,"name":"OpenStreetMap","url":f"https://www.openstreetmap.org/{element['type']}/{element['id']}","license":"ODbL 1.0","retrieved_at":element["retrieved_at"]}
            linked_sources.setdefault(qid, {})[place["id"]] = source
            row = candidates.setdefault(place["id"], {"place":place,"patch":{},"sources":[]})
            row["sources"].append(source)
            for field, value in osm_patch(place, element.get("tags", {})).items():
                row["patch"].setdefault(field, value)
            strict_matches += 1
    commons_pages = {}
    for cached in fetcher.cache.iterdir():
        if cached.suffix or time.time() - cached.stat().st_mtime > 86400:
            continue
        try:
            with cached.open("rb") as stream:
                prefix = stream.read(1000)
                if b'"query"' not in prefix:
                    continue
                stream.seek(0)
                response = json.load(stream)
            for page in response.get("query", {}).get("pages", {}).values():
                if page.get("imageinfo"):
                    title = page["title"].replace("_", " ")
                    current = commons_pages.get(title, {}).get("imageinfo", [{}])[0]
                    fresh = page["imageinfo"][0]
                    if title not in commons_pages or not current.get("thumburl") or urllib.parse.urlparse(fresh.get("thumburl", "")).hostname == "thumb.wikimedia.org":
                        commons_pages[title] = page
        except (ValueError, OSError):
            continue
    image_titles = list(dict.fromkeys("File:"+image for qid in ids
        if any(linked_entity(place, entities.get(qid, {})) and not place.get("photo_count", 0) for place in linked[qid].values())
        for image in values(entities.get(qid, {}), "P18")[:1] if isinstance(image, str)))
    def usable_page(title):
        page = commons_pages.get(title.replace("_", " "), {})
        info = next(iter(page.get("imageinfo", [])), {})
        thumbnail = info.get("thumburl", "")
        if urllib.parse.urlparse(thumbnail).hostname == "thumb.wikimedia.org":
            return True
        existing = thumbnail or info.get("url", "")
        return bool(existing and (fetcher.cache / hashlib.sha256(existing.encode()).hexdigest()).exists())
    pending_titles = [title for title in image_titles if not usable_page(title)]
    for start in range(0, len(pending_titles), 20):
        try:
            response = fetcher.api("commons.wikimedia.org", action="query", titles="|".join(pending_titles[start:start+20]), prop="imageinfo", iiprop="url|extmetadata|size", iiurlwidth=960)
            for page in response.get("query", {}).get("pages", {}).values():
                commons_pages[page.get("title", "").replace("_", " ")] = page
        except Exception as error:
            failures.append({"reason":"Lot Commons indisponible : "+str(error)[:150],"files":pending_titles[start:start+20]})
        print(json.dumps({"phase":"commons","processed":min(start+20,len(pending_titles)),"total":len(pending_titles)}),flush=True)
    downloads = []
    assigned = set()
    for qid in ids:
        entity = entities.get(qid, {})
        for place in linked[qid].values():
            if not linked_entity(place, entity):
                failures.append({"placeId": place["id"], "name": place["name"], "reason": "Correspondance Wikidata insuffisante", "qid": qid})
                continue
            candidate = candidates.setdefault(place["id"], {"place": place, "patch": {}, "sources": []})
            source = {"key": f"wikidata:{qid}", "name": "Wikidata", "url": f"https://www.wikidata.org/wiki/{qid}", "license": "CC0", "retrieved_at": today}
            candidate["sources"].extend([linked_sources[qid][place["id"]], source])
            description = entity.get("descriptions", {}).get("fr", {}).get("value", "")
            if missing_field(place, "description") and description:
                candidate["patch"]["description"] = description[:2000]
            websites = list(dict.fromkeys(safe_website(v) for v in values(entity, "P856") if safe_website(v)))
            if missing(place.get("website")) and "website" not in candidate["patch"] and len(websites) == 1:
                candidate["patch"]["website"] = websites[0]
            images = list(dict.fromkeys(v for v in values(entity, "P18") if isinstance(v, str)))
            if not images or place["id"] in assigned or photo_limit is not None and len(downloads) >= photo_limit or place.get("photo_count", 0):
                continue
            try:
                if not re.search(r"\.(?:jpe?g|png)$", images[0], re.I):
                    raise ValueError("Illustration non photographique ou format source exclu")
                page = commons_pages.get(("File:"+images[0]).replace("_", " "), {})
                if not page:
                    response = fetcher.api("commons.wikimedia.org", action="query", titles="File:"+images[0], prop="imageinfo", iiprop="url|extmetadata|size", iiurlwidth=960)
                    page = next(iter(response.get("query", {}).get("pages", {}).values()), {})
                info = next(iter(page.get("imageinfo", [])), {})
                credit = licensed_photo(info)
                if not credit:
                    raise ValueError("Licence ou crédit de la photo non confirmé")
                credit["commonsPageId"] = page["pageid"]
                # Crédit conservé dans le champ existant ; aucune extension des règles.
                caption = f"@commons:{page['pageid']}|{credit['license']}|{credit['author']}"
                if len(caption) > 160 or re.search(r"[|\r\n]", credit['author']):
                    raise ValueError("Crédit trop long pour être conservé intégralement")
                credit["caption"] = caption
                downloads.append((candidate, place, qid, images[0], credit))
                assigned.add(place["id"])
            except Exception as error:
                failures.append({"placeId": place["id"], "name": place["name"], "reason": str(error)[:200]})
    def download_photo(task):
        candidate, place, qid, title, credit = task
        data = fetcher.fetch(credit["downloadUrl"])
        if data[:2] != b"\xff\xd8" and data[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("Seuls les originaux JPEG/PNG sont acceptés")
        digest = hashlib.sha256(data).hexdigest()
        file = f"originals/{digest}.image"
        (out / file).write_bytes(data)
        photo = {**credit, "originalFile": file, "originalSha256": digest,
                 "status": "pending-privacy", "fileTitle": title, "wikidataId": qid}
        old = previous_photos.get(place["id"], {})
        if old.get("originalSha256") == digest and old.get("finalFile") and (out / old["finalFile"]).exists():
            for field in ("finalFile", "finalSha256", "bytes", "masks", "detectionComplete", "status"):
                if field in old:
                    photo[field] = old[field]
        return candidate, photo
    # Libérer le catalogue complet avant les téléchargements et la préparation photo.
    del places, by_source, names, cells, linked, linked_sources, entities, unresolved
    completed = 0
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(download_photo, task):task for task in downloads}
        for future in as_completed(jobs):
            completed += 1
            try:
                candidate, photo = future.result()
                candidate["photo"] = photo
                photos += 1
                if photos % 25 == 0:
                    print(json.dumps({"phase":"photos","downloaded":photos,"total":len(downloads)}),flush=True)
            except Exception as error:
                place = jobs[future][1]
                failures.append({"placeId":place["id"],"name":place["name"],"reason":str(error)[:200]})
            if completed % 25 == 0:
                print(json.dumps({"phase":"download-progress","completed":completed,"accepted":photos,"total":len(downloads)}),flush=True)
    rows = [c for c in candidates.values() if c["patch"] or c.get("photo")]
    for row in rows:
        row["sources"] = list({s["key"]: s for s in row["sources"]}.values())
        row["expected"] = {k: row["place"].get(k) for k in row["patch"]}
        row["baseVersion"] = row["place"]["version"]
        row["status"] = "pending-review"
    report = {"schema": 1, "created": today, "scope": "France métropolitaine et Corse ; rapprochement par identifiant de source",
              "firebaseCalls": 0, "externalCalls": fetcher.calls, "placesScanned": places_scanned, "osmMatchedPlaces": len(matched), "rawElements": raw_count, "wikidataIds": len(ids),"strictAdditionalMatches":strict_matches, "tourismMatchedPlaces":tourism_matched,"cultureMatchedPlaces":culture_matched,
              "candidates": rows, "failures": failures,
              "limitations": ["Couverture des informations et photos limitée aux champs explicitement présents et aux liens OSM/Wikidata confirmés.",
                              "Aucune donnée manquante n'est déduite. Aucun contenu Gemini/Google Maps.",
                              "Toute photo exige une vérification humaine du floutage avant publication."]}
    (out / "candidates.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"placesScanned": places_scanned, "candidates": len(rows), "fields": sum(len(c["patch"]) for c in rows),
                      "photos": photos, "externalCalls": fetcher.calls, "firebaseCalls": 0, "failures": len(failures)}, ensure_ascii=False))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--wikidata-limit", type=int)
    parser.add_argument("--photo-limit", type=int)
    args = parser.parse_args()
    if any(v is not None and v < 0 for v in (args.wikidata_limit, args.photo_limit)):
        parser.error("Les limites facultatives doivent être positives")
    collect(ROOT, args.out, args.wikidata_limit, args.photo_limit)
