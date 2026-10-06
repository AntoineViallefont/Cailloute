"""Intègre uniquement un export explicitement validé, localement et sans Firebase."""
import argparse
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("open_catalog", ROOT / "scripts/enrich-open-catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
FIELDS = {*catalog.TEXT_LIMITS, *catalog.TRI_FIELDS.values()}


def accepted_patch(row, place):
    if row.get("baseVersion") != place.get("version") or place.get("community") or place.get("deleted") or place.get("withdrawn") or place.get("redirect"):
        return {}
    patch = {}
    for key, value in row.get("patch", {}).items():
        if key not in FIELDS or key not in row.get("expected", {}):
            raise ValueError("Champ d'enrichissement non autorisé")
        if not catalog.missing_field(place, key) or not catalog.missing_field({key: row["expected"][key]}, key):
            continue
        if key in catalog.TEXT_LIMITS:
            if not isinstance(value, str) or not value.strip() or len(value) > catalog.TEXT_LIMITS[key]:
                raise ValueError("Texte d'enrichissement invalide")
            if key == "website" and catalog.safe_website(value) != value:
                raise ValueError("Site web invalide")
        elif not isinstance(value, bool):
            raise ValueError("Valeur d'équipement non explicite")
        patch[key] = value
    return patch


def build_approved(plan, places):
    if plan.get("schema") != 1 or plan.get("approved") is not True or not plan.get("approvedAt") or not isinstance(plan.get("candidates"), list):
        raise ValueError("Une validation explicite du lot est nécessaire")
    if len(plan["candidates"]) > 700000:
        raise ValueError("Lot trop volumineux")
    patches, seen = {}, set()
    for row in plan["candidates"]:
        ident = row["place"]["id"]
        if ident in seen:
            raise ValueError("Lieu en double")
        seen.add(ident)
        current = places.get(ident)
        if not current:
            continue
        patch = accepted_patch(row, current)
        if not patch:
            continue
        sources = row.get("sources", [])
        if not sources or any(not all(isinstance(s.get(k), str) and s[k] for k in ["key", "name", "url", "license", "retrieved_at"]) or not s["url"].startswith("https://") or s["license"] not in {"CC0", "ODbL 1.0", "Licence Ouverte 2.0"} for s in sources):
            raise ValueError("Source ou licence absente")
        patches[ident] = {"approved": True, "baseVersion": current["version"], "expected": {k: current.get(k) for k in patch}, "patch": patch, "sources": sources}
    return patches


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path, help="Export enrichissement-valide.json")
    parser.add_argument("--apply", action="store_true", help="Écrire le complément validé dans le projet ; aucun déploiement")
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    patches = build_approved(plan, catalog.catalog_places(ROOT))
    target = ROOT / "app/src/data-open-enrichment.json"
    previous = json.loads(target.read_text())
    # Cumule les éditions approuvées : les contributions du téléphone priment toujours.
    for ident, patch in patches.items():
        old = previous.get(ident)
        if old and old["baseVersion"] == patch["baseVersion"]:
            patch = {**patch, "expected": {**old["expected"], **patch["expected"]}, "patch": {**old["patch"], **patch["patch"]}, "sources": list({s["key"]: s for s in [*old["sources"], *patch["sources"]]}.values())}
        previous[ident] = patch
    if args.apply:
        temporary = target.with_suffix(".part")
        temporary.write_text(json.dumps(previous, ensure_ascii=False, separators=(",", ":")) + "\n")
        temporary.replace(target)
    print(json.dumps({"mode": "appliqué localement" if args.apply else "simulation", "places": len(patches), "fields": sum(len(p["patch"]) for p in patches.values()), "firebaseCalls": 0}, ensure_ascii=False))
