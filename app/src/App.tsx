import {outsideSearchAnchor} from "./search-zone";
import {stored,storedFilters,storedOrigin} from "./preferences";
import { Capacitor } from "@capacitor/core";
import { ageBands,ageBandForAge } from "./playground-age";
import { ChoiceSelect } from "./ChoiceSelect";
import { waitForStableMap } from "./startup";
import { ConnectionStatus } from "./ConnectionStatus";
import { Welcome } from './Welcome';
import { useFreeAccount } from "./useFreeAccount";
import { FreeCollaboration } from "./FreeCollaboration";
import { freeCollaborationEnabled } from "./free-cloud";
import { ProfileAvatar } from "./ProfileAvatar";
import { offlineMap } from "./map-cache";
import { loadFranceProgressively } from "./france-catalog";
import { inFrance } from "./france";
import { NearbyPrompt } from "./NearbyPrompt";
import { transitLabels, transitLetters, type TransitMode } from "./types";
import { useTransitRoutes } from "./TransitRoutes";
import { categoryInk } from "./types";
import { placeSourceIds } from "./canonical-data";
import { finishLaunch, nativeLaunchTheme } from "./launch";
import { useState, useEffect, useMemo, useRef, useCallback, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Images,
  Map as MapIcon,
  List,
  Heart,
  PlusCircle,
  UserRound,
  Search,
  LocateFixed,
  Moon,
  Sun,
  Monitor,
  Layers,
  SlidersHorizontal,
  Star,
  MapPin,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
import { Geolocation } from "@capacitor/geolocation";
import { App as NativeApp } from "@capacitor/app";
import {
  db,
  allPlaces,
  favoritePlaces,
  type PlaceBounds,
  searchAddress,
  api,
  favorite,
  boot,
  native,
  user,
  sync,
  syncState,
  notify,
} from "./store";
import { personalMode } from "./personal";
import { visibleFamilyPlace, placeLabel } from "./place-rules";
import { MapView, categoryIcons, PlaceSymbol } from "./MapView";
import { Weather } from "./Weather";
import { Modal, dismissTopModal } from "./Modal";
import { Detail } from "./Detail";
import { AccuracyIcon } from "./AccuracyIcon";
import { PlaceForm } from "./PlaceForm";
import { Profile, Auth } from "./Profile";
import {
  categories,
  filterCategories,
  colors,
  singular,
  LYON,
  type Place,
  type Origin,
  type Category,
} from "./types";
import {
  defaults,
  selectedPrices,
  matches,
  distance,
  distanceLabel,
  radiusBounds,
  radiusQueryExtent,
  radiusFromSlider,
  radiusToSlider,
  type Filters,
} from "./geo";
const normalizeSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

type Suggestion = {
  key: string;
  label: string;
  kind: string;
  choose: () => void;
  place?: Place;
  meters?: number;
};
export default function App() {
  const [, render] = useState(0);
  const [nearbyPreview, setNearbyPreview] = useState(import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "nearby");
  const [theme, setTheme] = useState(stored<string>("theme", "system"));
  const [screen, setScreen] = useState("explore");
  const [list, setList] = useState(false);
  const [aerial, setAerial] = useState(stored<boolean>("aerial", false)===true);
  const [origin, setOriginState] = useState<Origin>(storedOrigin());
  const [mapTarget, setMapTarget] = useState<Place | null>(null);
  const showOnMap = (place: Place) => {
    setMapTarget(place);
    setSelected(null);
    setList(false);
    if (screen === "profile") setScreen("explore");
  };
  useEffect(() => setMapTarget(null), [origin]);
  const [catalogError,setCatalogError] = useState("");
  const [center, setCenter] = useState<{lat:number;lon:number;bounds?:PlaceBounds}>({ lat: origin.lat, lon: origin.lon });
  const [pendingZone,setPendingZone]=useState<typeof center|null>(null);
  const [areaSelection,setAreaSelection]=useState<typeof center|null>(null);
  const areaBounds=areaSelection?.bounds || null;
  function setOrigin(next:Origin){
    setPendingZone(null);setAreaSelection(null);setOriginState(next);
  }
  const onMapCenter=useCallback((view:typeof center,userMoved=false)=>{
    if(userMoved){
      const outside=outsideSearchAnchor(view,areaSelection || origin);
      setPendingZone(outside?view:null);
      if(outside)setSearchOpen(false);else setCenter(view);
    } else if(!pendingZone)setCenter(view);
  },[pendingZone,areaSelection,origin]);
  function applyVisibleZone(){
    if(!pendingZone?.bounds)return;
    setCenter(pendingZone);setAreaSelection(pendingZone);setPendingZone(null);
    setQuery("");setSearchOpen(false);setResults([]);setSelected(null);setMapTarget(null);
  }



  const [filters, setFilters] = useState<Filters>(() => {
    const older = storedFilters("filters-v3", defaults);
    const saved = storedFilters(
      "filters-v6",
      storedFilters(
        "filters-v5",
        storedFilters("filters-v4", {
          ...older,
          categories: [...new Set([...older.categories, "health" as const])],
        }),
      ),
    );
    const previous=storedFilters("filters-v7", {...defaults,...saved,transitModes:["metro","tram","bus"]});
    const recent=storedFilters("filters-v8", {
      ...defaults,...previous,
      transitModes:["metro","tram","bus"].every(m=>previous.transitModes.includes(m as TransitMode))?[...defaults.transitModes]:previous.transitModes,
      categories:previous.categories.filter(c=>c!=="other"),
    });
    const previousFilters=storedFilters("filters-v9", {...recent,childAge:null,ageBand:ageBandForAge(recent.childAge)});
    const current=storedFilters("filters-v10", {...previousFilters,radius:previousFilters.radius===30000?10000:previousFilters.radius});
    return {...current,radius:Math.min(50000,Math.max(100,current.radius)),includeUnknownAge:false};
  });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [results, setResults] = useState<Origin[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Place | null>(null);
  const transit = useTransitRoutes(selected);
  const openPlace = useCallback((place: Place) => {
    if (list || screen === "profile") setMapTarget(place);
    setList(false);
    if (screen === "profile") setScreen("explore");
    setSelected(place);
  },[list,screen]);
  const [modal, setModal] = useState("");
  const freeAccount=useFreeAccount();
  const [authCreate,setAuthCreate]=useState(false);
  const [welcome,setWelcome]=useState(()=>!stored("account-welcome-v1",false));
  const dismissWelcome=()=>{localStorage.setItem("account-welcome-v1","true");setWelcome(false);};
  const [message, setMessage] = useState("");
  const [limit, setLimit] = useState(60);
  const [loading, setLoading] = useState(true);
  const [bootReady,setBootReady]=useState(false);
  const [positionReady,setPositionReady]=useState(false);
  const [themeReady,setThemeReady]=useState(false);
  const [catalogReady,setCatalogReady]=useState(false);
  const [catalogRevision,setCatalogRevision]=useState(0);
  const [locating, setLocating] = useState(false);
  const filterOrigin=useMemo(()=>areaSelection?{...origin,lat:areaSelection.lat,lon:areaSelection.lon}:origin.chosen?origin:{...origin,lat:center.lat,lon:center.lon},[origin,areaSelection,center.lat,center.lon]);
  const queryRadius=radiusQueryExtent(filters.radius);
  useEffect(()=>{
    if(loading || !bootReady || !positionReady || screen!=="explore")return;
    setCatalogReady(false);
    let cancelled=false;
    const importRadius=areaBounds?Math.min(50000,Math.max(100,...[{lat:areaBounds.south,lon:areaBounds.west},{lat:areaBounds.north,lon:areaBounds.east}].map(p=>distance(filterOrigin,p)))):filters.radius;
    const cap=radiusBounds(filterOrigin,importRadius);
    const view=areaBounds || (list?cap:center.bounds)||{west:center.lon-.12,east:center.lon+.12,south:center.lat-.08,north:center.lat+.08};
    const bounds={west:Math.max(cap.west,view.west),east:Math.min(cap.east,view.east),south:Math.max(cap.south,view.south),north:Math.min(cap.north,view.north)};
    if(bounds.west>bounds.east || bounds.south>bounds.north){setCatalogReady(true);return;}
    const ready=()=>{if(!cancelled){setCatalogRevision(n=>n+1);setCatalogReady(true);}};
    const timer=setTimeout(()=>{
      void (async()=>{
        await loadFranceProgressively(bounds,()=>cancelled,filterOrigin,importRadius,ready);
        if(!cancelled)setCatalogError("");
      })().catch(()=>{if(!cancelled && !offlineMap())setCatalogError("Chargement incomplet : les lieux déjà enregistrés restent disponibles.");}).finally(ready);
    },250);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[loading,bootReady,positionReady,list,screen,JSON.stringify(center),filterOrigin.lat,filterOrigin.lon,filters.radius,areaBounds]);

  // Ne pas relire et regrouper tout le catalogue après chacun des imports initiaux.
  const readBounds = useMemo<PlaceBounds|undefined>(() => {
    if(screen!=="explore" || (searchOpen && query.trim().length>=2))return undefined;
    if(areaBounds)return areaBounds;
    if(list) {
      return radiusBounds(filterOrigin,queryRadius);
    }
    const b=center.bounds || stored<PlaceBounds>("mapViewport",{south:origin.lat-.1,north:origin.lat+.1,west:origin.lon-.1,east:origin.lon+.1});
    const dy=Math.max(.002,(b.north-b.south)*.5),dx=Math.max(.002,(b.east-b.west)*.5);
    return {south:b.south-dy,north:b.north+dy,west:b.west-dx,east:b.east+dx};
  },[screen,list,searchOpen,query.trim().length>=2,center,filterOrigin,queryRadius,areaBounds]);
  const favoritesOnly=screen==="favorites" && (!searchOpen || query.trim().length<2);
  const loadedResult = useLiveQuery(async () => loading ? undefined : {places:screen==="profile"?[]:await (favoritesOnly?favoritePlaces():allPlaces(readBounds)),revision:catalogRevision}, [loading,screen,favoritesOnly,freeAccount?.uid,JSON.stringify(readBounds),catalogRevision]);
  const loadedPlaces=loadedResult?.places;
  const previousPlaces=useRef<Place[]>([]);
  if(loadedPlaces)previousPlaces.current=loadedPlaces;
  const places = loadedPlaces || previousPlaces.current;
  useEffect(() => {
    if (loading || !bootReady || !positionReady || !themeReady || !catalogReady || !loadedPlaces || loadedResult?.revision!==catalogRevision) return;
    let active = true;
    void waitForStableMap().then(() => { if (active) finishLaunch(); });
    return () => { active = false; };
  }, [loading, bootReady, positionReady, themeReady, catalogReady, catalogRevision, loadedResult]);
  const faves = useLiveQuery(() => db.favorites.toArray(), []) || [];
  const favorites = useMemo(() => new Set((freeCollaborationEnabled && !freeAccount ? [] : faves).map((f) => f.id)), [faves,freeAccount]);
  const [openingMinute, setOpeningMinute] = useState(0);
  useEffect(() => {
    if (!filters.open && !filters.recentlyValidated) return;
    const refresh = () => setOpeningMinute((minute) => minute + 1);
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [filters.open, filters.recentlyValidated]);
  const groupedPlaces = useMemo(() => {
    const rows=places.filter(visibleFamilyPlace);
    if(!list)return rows;
    return rows.map(place=>({place,metres:distance(place,filterOrigin)})).sort((a,b)=>a.metres-b.metres).map(item=>item.place);
  },[places,list,filterOrigin]);
  const filtered = useMemo(
    () => groupedPlaces.filter((p) => matches(p, filters, filterOrigin) && (!areaBounds || (p.lat>=areaBounds.south && p.lat<=areaBounds.north && p.lon>=areaBounds.west && p.lon<=areaBounds.east))),
    [groupedPlaces, filters, filterOrigin, openingMinute,areaBounds],
  );
  const visiblePlaces = useMemo(() => screen === "favorites"
    ? filtered.filter(p => [p.id,...placeSourceIds(p)].some(id => favorites.has(id)))
    : filtered, [screen, filtered, favorites]);
  const mapPlaces = useMemo(() => mapTarget && !visiblePlaces.some(p => p.id === mapTarget.id)
    ? [...visiblePlaces, mapTarget] : visiblePlaces, [visiblePlaces, mapTarget]);
  const items = visiblePlaces;
  const listScrollRef=useCallback((node:HTMLDivElement|null)=>{
    if(node)node.scrollTop=Number(sessionStorage.getItem("scroll-"+screen)||0);
  },[screen]);
  function toast(s: string) {
    setMessage(s);
    setTimeout(() => setMessage(""), 4500);
  }
  useEffect(() => {
    // Le cache et la navigation restent accessibles même si un service tarde à répondre.
    const deadline=setTimeout(finishLaunch,8000);
    const h = () => render((n) => n + 1);
    window.addEventListener("cailloute", h);
    // Le cache devient consultable sans attendre les imports, les fusions ou le réseau.
    void db.places.count().then(count=>{if(count>0)setLoading(false);}).catch(()=>{});
    void boot().catch(() => setCatalogError("Préparation incomplète. Vos données enregistrées sont conservées ; réessayez après réouverture.")).finally(() => {setLoading(false);setBootReady(true);});
    return () => {clearTimeout(deadline);window.removeEventListener("cailloute", h);};
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    let active = true;
    let revision = 0;
    const apply = async () => {
      const request = ++revision;
      // Android fournit son thème réel, même si la WebView annonce un thème différent.
      const dark = await nativeLaunchTheme(theme);
      if (active && request === revision) {
        const nextTheme=dark === undefined
          ? (theme === "system" ? (media.matches ? "dark" : "light") : theme)
          : dark ? "dark" : "light";
        if(document.documentElement.dataset.theme!==nextTheme)document.documentElement.dataset.theme=nextTheme;
        setThemeReady(true);
      }
    };
    void apply();
    localStorage.setItem("theme", JSON.stringify(theme));
    media.addEventListener("change", apply);
    window.addEventListener("cailloute-appearance", apply);
    return () => {
      active = false;
      media.removeEventListener("change", apply);
      window.removeEventListener("cailloute-appearance", apply);
    };
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("filters-v10", JSON.stringify(filters));
    sessionStorage.removeItem("scroll-explore");
    setLimit(60);
  }, [filters]);
  useEffect(() => {
    localStorage.setItem("origin", JSON.stringify(origin));
    void sync();
    sessionStorage.removeItem("scroll-explore");
    setLimit(60);
  }, [origin]);
  useEffect(()=>{
    if(freeAccount?.isAdmin && !loading)void sync();
  },[freeAccount?.uid,freeAccount?.isAdmin,loading,Math.floor(center.lat*4),Math.floor(center.lon*4)]);
  useEffect(() => {
    localStorage.setItem("aerial", JSON.stringify(aerial));
  }, [aerial]);
  useEffect(() => {
    if (!native) return;
    const listener = NativeApp.addListener("backButton", () => {
      if (dismissTopModal()) return;
      if (modal) setModal("");
      else if (selected) setSelected(null);
      else if (screen !== "explore") setScreen("explore");
      else if (list) setList(false);
      else void NativeApp.minimizeApp();
    });
    return () => {
      void listener.then((h) => h.remove());
    };
  }, [modal, selected, screen, list]);
  useEffect(() => {
    // Au démarrage seulement : stabiliser la position avant de révéler la carte.
    let active=true;
    const prepare=async()=>{
      if(origin.chosen && origin.label!=="Ma position")return;
      try{
        const granted=native
          ? await Geolocation.checkPermissions().then(p=>p.location==="granted" || p.coarseLocation==="granted")
          : navigator.permissions ? await navigator.permissions.query({name:"geolocation"}).then(p=>p.state==="granted") : false;
        if(granted && active)await locate();
      }catch{}
    };
    void prepare().finally(()=>{if(active)setPositionReady(true);});
    return()=>{active=false;};
  }, []);
  async function locate() {
    setLocating(true);
    try {
      const p = native
        ? await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000,
          })
        : await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 60000,
            }),
          );
      const next = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        label: "Ma position",
        chosen: true,
      };
      if (!inFrance(next))
        throw new Error(
          "Choisissez une position en France métropolitaine ou en Corse.",
        );
      setOrigin(next);
      setQuery("");
      setResults([]);
      if (p.coords.accuracy > 100)
        toast("Position approximative. Vous pouvez rechercher une adresse.");
    } catch (e) {
      toast(
        (e as Error).message ||
          "Position indisponible. Recherchez une adresse.",
      );
    } finally {
      setLocating(false);
    }
  }
  // Index de texte préparé une seule fois lorsque les lieux changent.
  const searchPlaces = useMemo(
    () =>
      (searchOpen && query.trim().length>=2 ? groupedPlaces : [])
        .filter((p) => !p.deleted && !p.withdrawn && !p.redirect)
        .map((place) => ({
          place,
          text: normalizeSearch(
            place.name +
              " " +
              place.city +
              " " +
              placeLabel(place) +
              " " +
              (place.activity_type || ""),
          ),
        })),
    [groupedPlaces,searchOpen,query.trim().length>=2],
  );
  const terms = normalizeSearch(query.trim());
  const suggestions = useMemo<Suggestion[]>(() => {
    if (terms.length < 2) return [];
    const aliases: Partial<Record<Category, string>> = {
      baby_shop: "vêtements habits bébé enfant puériculture",
      health: "médecin pharmacie urgences pédiatre",
      child_activity: "théâtre bébé gym bébé nageur piscine sport éveil",
      playground: "parc jeux",
      food_shop: "supermarché épicerie nourriture",
      transit: "bus métro tram",
      toilet: "wc toilettes table à langer",
    };
    const cats = filterCategories
      .filter((c) =>
        normalizeSearch(categories[c] + " " + (aliases[c] || "")).includes(
          terms,
        ),
      )
      .map((c) => ({
        key: c,
        label: categories[c],
        kind: "Filtre",
        choose: () => {
          setFilters((f) => ({ ...f, categories: [c] }));
          setSearchOpen(false);
          setQuery("");
        },
      }));
    const anchor = origin.chosen ? origin : center;
    const local = searchPlaces
      .filter((entry) => entry.text.includes(terms))
      .map(({ place }) => ({ place, meters: distance(place, anchor) }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 6)
      .map(({ place: p, meters }) => ({
        key: p.id,
        place: p,
        meters,
        label: p.name,
        kind: placeLabel(p) + (p.city ? " · " + p.city : ""),
        choose: () => {
          openPlace(p);
          setSearchOpen(false);
        },
      }));
    return [
      ...cats,
      ...[
        ...local,
        ...results.map((r, i) => ({
          key: "address-" + i,
          label: r.label,
          kind: "Adresse",
          meters: distance(r, anchor),
          choose: () => chooseOrigin(r),
        })),
      ].sort((a, b) => a.meters - b.meters),
    ];
  }, [terms, searchPlaces, results, origin, center, list, screen]);
  useEffect(() => {
    setResults([]);
    setSearchError("");
    setSearchIndex(-1);
    if (!searchOpen || query.trim().length < 3) {
      setSearching(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      void searchAddress(query, controller.signal)
        .then((r) => {
          if (active) setResults(r.results);
        })
        .catch(() => {
          if (active)
            setSearchError(
              navigator.onLine
                ? "Adresses indisponibles pour le moment."
                : "Hors ligne · recherche dans les lieux enregistrés.",
            );
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen]);
  function search() {
    setSearchOpen(true);
    if (suggestions[searchIndex >= 0 ? searchIndex : 0])
      suggestions[searchIndex >= 0 ? searchIndex : 0].choose();
  }
  function chooseOrigin(p: Origin) {
    setSearchOpen(false);
    setOrigin(p);
    setQuery(p.label);
    setResults([]);
    setSearchError("");
  }
  const filterCount =
    Number(filters.changing) +
    Number(filters.open) +
    (filters.categories.filter((c) => c !== "other").length <
    filterCategories.length
      ? 1
      : 0) +
    Number(!!filters.ageBand) + Number(filters.pmr) +
    Number(filters.transitModes.length < defaults.transitModes.length || filters.unknownTransit===false) +
    Number(filters.publicToilets) + Number(filters.organic) +
    Number(filters.minRating > 0) + Number(filters.recentlyValidated) + Number(filters.withPhotos) +
    (filters.radius !== defaults.radius ? 1 : 0) +
    (selectedPrices(filters).length < 3 ? 1 : 0) +
    (filters.categories.includes("health") &&
    (filters.healthTypes || defaults.healthTypes!).length < 3
      ? 1
      : 0);
  return (
    <div
      className={"app" + (screen !== "profile" && !list ? " showing-map" : "")}
    >
      {screen !== "profile" && (
        <>
          <Weather origin={origin} />
          <div
            className="search-area"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                setSearchOpen(false);
            }}
          >
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              {pendingZone && !list ? (
                <button type="button" className="search-zone" onClick={applyVisibleZone}>
                  <Search size={20} /> Afficher dans cette zone
                </button>
              ) : (<>
              <button
                className="icon-button search-submit"
                aria-label="Rechercher"
                type="submit"
              >
                {searching ? <RefreshCw className="spinning" /> : <Search />}
              </button>
              <input
                aria-label="Adresse, lieu ou filtre"
                placeholder="Adresse, lieu, filtre…"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={searchOpen && suggestions.length > 0}
                aria-controls="search-suggestions"
                aria-activedescendant={
                  searchIndex >= 0 ? `suggestion-${searchIndex}` : undefined
                }
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchIndex((i) =>
                      Math.max(
                        0,
                        Math.min(
                          suggestions.length - 1,
                          i + (e.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
                    );
                  }
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                  setSearchError("");
                  if (!e.target.value) setResults([]);
                }}
                enterKeyHint="search"
              />
              {query && (
                <button
                  className="icon-button small"
                  type="button"
                  aria-label="Effacer la recherche"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <X size={18} />
                </button>
              )}
              </>)}
              <button
                type="button"
                className={"icon-button locate " + (locating ? "spinning" : "")}
                aria-label="Me localiser"
                onClick={() => void locate()}
                disabled={locating}
              >
                <LocateFixed />
              </button>
              <button
                type="button"
                className="icon-button theme-button"
                aria-label="Choisir le thème"
                onClick={() => setModal("theme")}
              >
                {theme === "dark" ? <Sun size={21} /> : <Moon size={21} />}
              </button>
            </form>
            {searchOpen &&
              (suggestions.length > 0 ||
                searchError ||
                (query.trim().length >= 2 && !searching)) && (
                <div
                  className="search-results"
                  id="search-suggestions"
                  role="listbox"
                  aria-label="Suggestions"
                >
                  <div className="search-context">
                    Du plus proche au plus loin ·{" "}
                    {origin.chosen ? origin.label : "centre de la carte"}
                  </div>
                  {suggestions.map((r, i) => (
                    <button
                      key={r.key}
                      id={`suggestion-${i}`}
                      role="option"
                      aria-selected={i === searchIndex}
                      className="result"
                      onClick={r.choose}
                    >
                      {r.kind === "Filtre" ? (
                        <SlidersHorizontal size={18} />
                      ) : (
                        <MapPin size={18} style={r.place ? {color:colors[r.place.category]} : undefined} />
                      )}
                      <span className="suggestion-copy">
                        <strong>{r.label}</strong>
                        <small>
                          {r.meters !== undefined && (
                            <b>{distanceLabel(r.meters)} · </b>
                          )}
                          {r.kind}
                        </small>
                        {r.place && (
                          <span className="suggestion-reputation">
                            <span>
                              <Star
                                size={13}
                                className="star"
                                fill={
                                  r.place.review_count > 0 &&
                                  r.place.rating != null
                                    ? "currentColor"
                                    : "none"
                                }
                              />{" "}
                              {r.place.review_count > 0 &&
                              r.place.rating != null
                                ? `${r.place.rating.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/5 · `
                                : ""}
                              {r.place.review_count || 0} avis
                            </span>
                            <AccuracyIcon place={r.place} />{(r.place.photo_count || 0) > 0 && <span title="Photos disponibles" aria-label="Photos disponibles"><Images size={16} /></span>}
                          </span>
                        )}
                      </span>
                      {r.place && (
                        <Heart
                          className={
                            "suggestion-heart" +
                            (placeSourceIds(r.place).some((id) =>
                              favorites.has(id),
                            )
                              ? " selected"
                              : "")
                          }
                          size={19}
                          fill={
                            placeSourceIds(r.place).some((id) =>
                              favorites.has(id),
                            )
                              ? "currentColor"
                              : "none"
                          }
                          aria-label={
                            placeSourceIds(r.place).some((id) =>
                              favorites.has(id),
                            )
                              ? "Dans vos favoris"
                              : "Pas dans vos favoris"
                          }
                        />
                      )}
                    </button>
                  ))}
                  {!suggestions.length && !searching && !searchError && (
                    <p role="status">Aucun résultat.</p>
                  )}
                  {searchError && <p role="status">{searchError}</p>}
                </div>
              )}
          </div>
        </>
      )}
      <main className="main">
        {screen === "profile" ? (
          <Profile
            aerial={aerial}
            onSelect={openPlace}
            onLogin={() => setModal("auth")}
            toast={toast}
          />
        ) : (screen === "explore" || screen === "favorites") && !list ? (
          <div className="map-region">
            <MapView
              places={mapPlaces}
              target={mapTarget}
              routes={transit.routes}
              routeStop={selected}
              origin={origin}
              aerial={aerial}
              onSelect={openPlace}
              onCenter={onMapCenter}
            />
            {
              <button
                className="map-filter floating"
                onClick={() => setModal("filters")}
              >
                <SlidersHorizontal size={19} /> Filtres
                {filterCount > 0 && <b>{filterCount}</b>}
              </button>
            }
            <ConnectionStatus />
            <button
              className="map-layers floating icon-button"
              aria-label={
                aerial ? "Passer au plan" : "Passer à la vue aérienne"
              }
              title={aerial ? "Plan" : "Aérien"}
              onClick={() => setAerial(!aerial)}
            >
              <Layers />
            </button>
            <button
              className="view-toggle floating"
              onClick={() => setList(true)}
            >
              <List size={21} /> Liste
            </button>
            {(loading || (screen==="explore" && !catalogReady)) && places.length === 0 && (
              <div className="map-loading" role="status">Chargement des lieux en arrière-plan…</div>
            )}
            {!loading && (screen!=="explore" || catalogReady) && items.length === 0 && (
              <div className="map-empty">
                {screen === "favorites"
                  ? favorites.size
                    ? "Aucun favori avec ces filtres."
                    : "Ajoutez des lieux aux favoris avec le cœur."
                  : "Aucun lieu avec ces filtres."}
              </div>
            )}
          </div>
        ) : (
          <div className="list-region">
            <div className="list-head">
              <h1>{screen === "favorites" ? "Favoris" : "À proximité"}</h1>
              {
                <button
                  className="filter-button"
                  onClick={() => setModal("filters")}
                >
                  <SlidersHorizontal size={19} /> Filtres
                  {filterCount > 0 && <b>{filterCount}</b>}
                </button>
              }
            </div>
            {!origin.chosen && screen === "explore" && (
              <div className="origin-prompt">
                <MapPin />
                <p>
                  Choisissez votre point de départ pour trier les lieux par
                  distance.
                </p>
                <button className="text-button" onClick={() => void locate()}>
                  Me localiser
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    setOrigin({
                      ...LYON,
                      chosen: true,
                      label: "Centre de Lyon",
                    })
                  }
                >
                  Centre de Lyon
                </button>
              </div>
            )}
            <div
              className="place-list"
              ref={listScrollRef}
              onScroll={(e) =>
                sessionStorage.setItem(
                  "scroll-" + screen,
                  String(e.currentTarget.scrollTop),
                )
              }
            >
              {items.slice(0, limit).map((p) => {
                return (
                  <article className="place-row" key={p.id}>
                    <button className="place-open" onClick={() => openPlace(p)}>
                      <span
                        className="category-badge"
                        style={{
                          background: colors[p.category],
                          color: categoryInk(p.category),
                        }}
                      >
                        <PlaceSymbol place={p} />
                      </span>
                      <span className="place-text">
                        <strong>{p.name}</strong>
                        {!!p.transit_lines?.length && (
                          <span className="transit-lines" aria-label="Lignes">
                            {p.transit_lines.map((line) => (
                              <b key={line}>{line}</b>
                            ))}
                          </span>
                        )}
                        <span className="place-reputation">
                          <span>
                            <Star
                              size={14}
                              className="star"
                              fill={
                                p.review_count > 0 && p.rating != null
                                  ? "currentColor"
                                  : "none"
                              }
                            />{" "}
                            {p.review_count > 0 && p.rating != null
                              ? `${p.rating.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/5 · `
                              : ""}
                            {p.review_count || 0} avis
                          </span>
                          <AccuracyIcon place={p} />{(p.photo_count || 0) > 0 && <span title="Photos disponibles" aria-label="Photos disponibles"><Images size={16} /></span>}
                        </span>
                        <small>
                          {origin.chosen
                            ? distanceLabel(distance(origin, p)) + " · "
                            : ""}
                          {placeLabel(p)}
                          {p.changing_table === true && p.category === "toilet"
                            ? " · Table à langer"
                            : ""}
                        </small>
                      </span>
                    </button>
                    <button
                      className="icon-button show-on-map"
                      aria-label={"Voir sur la carte : " + p.name}
                      onClick={() => showOnMap(p)}
                    >
                      <MapIcon size={21} />
                    </button>
                    <button
                      className={
                        "icon-button favorite " +
                        (placeSourceIds(p).some((id) =>
                          favorites.has(id),
                        )
                          ? "selected"
                          : "")
                      }
                      aria-label={
                        placeSourceIds(p).some((id) =>
                          favorites.has(id),
                        )
                          ? `Retirer ${p.name} des favoris`
                          : `Ajouter ${p.name} aux favoris`
                      }
                      onClick={() => { if(freeCollaborationEnabled && !freeAccount){setModal("auth");return;} void favorite(p).catch(e=>toast(e.message)); }}
                    >
                      <Heart
                        fill={
                          placeSourceIds(p).some((id) =>
                            favorites.has(id),
                          )
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  </article>
                );
              })}
              {items.length === 0 && (
                <div className="empty">
                  <Heart size={36} />
                  <h2>
                    {screen === "favorites"
                      ? favorites.size
                        ? "Aucun favori avec ces filtres"
                        : "Vos lieux préférés, ici"
                      : "Aucun lieu trouvé"}
                  </h2>
                  <p>
                    {screen === "favorites"
                      ? favorites.size
                        ? "Élargissez les filtres ou la distance."
                        : "Touchez un cœur pour garder un lieu."
                      : "Essayez d’élargir les filtres ou la distance."}
                  </p>
                </div>
              )}
              {limit < items.length && (
                <button
                  className="secondary more"
                  onClick={() => setLimit((n) => n + 60)}
                >
                  Afficher davantage ({items.length.toLocaleString("fr-FR")})
                </button>
              )}
            </div>
            {(screen === "explore" || screen === "favorites") && (
              <button
                className="view-toggle floating"
                onClick={() => setList(false)}
              >
                <MapIcon size={22} /> Carte
              </button>
            )}
          </div>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Navigation principale">
        {[
          ["explore", "Carte", MapIcon],
          ["favorites", "Favoris", Heart],
          ["contribute", "Contribuer", PlusCircle],
          ["profile", "Profil", UserRound],
        ].map(([key, label, I]) => {
          const Icon = I as typeof Heart;
          return (
            <button
              key={String(key)}
              className={screen === key ? "active" : ""}
              aria-current={screen === key ? "page" : undefined}
              onClick={() => {
                if (key === "favorites" && !(freeCollaborationEnabled ? freeAccount : user)) {
                  setModal("auth"); return;
                }
                if (key === "contribute") {
                  setModal((freeCollaborationEnabled ? !!freeAccount : personalMode || user) ? "create" : "auth");
                  return;
                }
                setSelected(null);
                setScreen(String(key));
                setLimit(60);
              }}
            >
              {key === "profile" ? <ProfileAvatar small /> : <Icon
                size={32}
                fill={
                  key === "explore" && screen === key ? "currentColor" : "none"
                }
              />}
              <span>{String(label)}</span>
            </button>
          );
        })}
      </nav>
      {selected && (
        <Detail
          key={selected.id}
          place={selected}
          aerial={aerial}
          origin={origin}
          pmr={filters.pmr}
          onClose={() => setSelected(null)}
          onShowMap={showOnMap}
          onLogin={() => setModal("auth")}
          toast={toast}
        />
      )}
      {!personalMode && user?.moderation?.can_contribute === false && <div className="catalog-status" role="status">Contributions suspendues · décision et contestation dans Profil.</div>}
      {catalogError && <div className="catalog-status" role="status">{catalogError}</div>}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      {modal === "theme" && (
        <Modal title="Apparence" onClose={() => setModal("")}>
          <div className="theme-options">
            {[
              ["light", "Jour", Sun],
              ["dark", "Nuit", Moon],
              ["system", "Système", Monitor],
            ].map(([value, label, I]) => {
              const Icon = I as typeof Sun;
              return (
                <button
                  key={String(value)}
                  className={theme === value ? "chosen" : ""}
                  onClick={() => {
                    setTheme(String(value));
                    setModal("");
                  }}
                >
                  <Icon />
                  <span>{String(label)}</span>
                  {theme === value && <Check size={18} />}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {welcome && <Welcome onContinue={dismissWelcome} onCreate={()=>{dismissWelcome();setAuthCreate(true);setModal("auth");}} onLogin={()=>{dismissWelcome();setAuthCreate(false);setModal("auth");}}/>}
      {modal === "auth" && (freeCollaborationEnabled ? <FreeCollaboration initialOpen initialCreate={authCreate} onClose={()=>setModal("")} /> : <Auth onClose={() => setModal("")} toast={toast} />)}
      {modal === "create" && (
        <PlaceForm
          position={center}
          existingPlaces={places}
          aerial={aerial}
          onClose={() => setModal("")}
          onSaved={async (id) => {
            setModal("");
            const saved = (await allPlaces()).find(p => p.id === id);
            if (saved) { setMapTarget(saved); setSelected(saved); setScreen("explore"); setList(false); }
            toast(
              personalMode
                ? "Lieu enregistré sur cet appareil."
                : "Lieu enregistré. Consultez l’état d’envoi dans Profil.",
            );
          }}
        />
      )}
      {import.meta.env.DEV && nearbyPreview && <NearbyPrompt
        onClose={() => setNearbyPreview(false)}
        onValidate={() => { setNearbyPreview(false); toast("Aperçu : les informations du lieu seraient validées."); }}
        onPhotos={() => { setNearbyPreview(false); toast("Aperçu : ouverture de l’ajout de photos avec vérification du floutage."); }}
        onEdit={() => { setNearbyPreview(false); toast("Aperçu : ouverture du formulaire de modification."); }}
      />}
      {modal === "filters" && (
        <Modal
          title="Filtres"
          onClose={() => setModal("")}
          actions={
            <div
              className="filter-selection-actions"
              role="group"
              aria-label="Sélection des catégories"
            >
              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    categories: [...filterCategories],
                    transitModes: [...defaults.transitModes],
                    healthTypes: [...defaults.healthTypes!],
                  }))
                }
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, categories: [] }))}
              >
                Aucun
              </button>
            </div>
          }
        >
          <div className="filter-categories">
            {filterCategories.map((key) => {
              const label = categories[key];
              const Icon = categoryIcons[key];
              return (
                <button
                  key={key}
                  style={{ "--category-color": colors[key] } as CSSProperties}
                  aria-pressed={filters.categories.includes(key)}
                  data-category={key}
                  className={filters.categories.includes(key) ? "on" : ""}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      categories: f.categories.includes(key)
                        ? f.categories.filter((c) => c !== key)
                        : [...f.categories, key],
                    }))
                  }
                >
                  <Icon size={21} style={{ color: colors[key] }} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {filters.categories.includes("health") && (
            <section
              className="filter-section category-selection"
              style={{ "--category-color": colors.health } as CSSProperties}
            >
              <h3>Santé</h3>
              <div className="chip-group">
                {[
                  ["doctor", "Pédiatres"],
                  ["pharmacy", "Pharmacies"],
                  ["emergency", "Urgences"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={(
                      filters.healthTypes || defaults.healthTypes!
                    ).includes(value)}
                    onClick={() =>
                      setFilters((f) => {
                        const selected = f.healthTypes || defaults.healthTypes!;
                        return {
                          ...f,
                          healthTypes: selected.includes(value)
                            ? selected.filter((t) => t !== value)
                            : [...selected, value],
                        };
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}
          {filters.categories.includes("transit") && (
            <section
              className="filter-section category-selection"
              style={{ "--category-color": colors.transit } as CSSProperties}
            >
              <h3>Transports</h3>
              <div className="chip-group transit-chips">
                {(Object.keys(transitLabels) as TransitMode[]).map((mode) => <button
                  key={mode} aria-pressed={filters.transitModes.includes(mode)}
                  onClick={() => setFilters((f) => ({...f, transitModes: f.transitModes.includes(mode) ? f.transitModes.filter((m) => m !== mode) : [...f.transitModes, mode]}))}
                ><b>{transitLetters[mode]}</b>{transitLabels[mode]}</button>)}
                <button aria-pressed={filters.unknownTransit !== false} onClick={()=>setFilters(f=>({...f,unknownTransit:f.unknownTransit===false}))}>Mode non renseigné</button>
              </div>
            </section>
          )}
          {(filters.categories.includes("playground") || filters.categories.includes("child_activity")) && <section className="filter-section category-selection playground-age">
            <h3>Âge de l’enfant</h3>
            <ChoiceSelect label="Âge de l’enfant" value={filters.ageBand || ""} options={[{value:"",label:"Tous les âges"},...ageBands]} onChange={value=>setFilters(f=>({...f,ageBand:value||null,childAge:null}))}/>

          </section>}
          {filters.categories.includes("toilet") && (
            <section
              className="filter-section category-selection"
              style={
                {
                  "--category-color": colors.toilet,
                  "--category-ink": categoryInk("toilet"),
                } as CSSProperties
              }
            >
              <h3>Toilettes</h3>
              <div className="chip-group">
                <button aria-pressed={filters.publicToilets} onClick={() => setFilters((f) => ({...f, publicToilets: !f.publicToilets}))}>Public</button>
                <button
                  aria-pressed={filters.changing}
                  onClick={() =>
                    setFilters((f) => ({ ...f, changing: !f.changing }))
                  }
                >
                  Table à langer
                </button>
              </div>
            </section>
          )}
          {filters.categories.includes("food_shop") && <section className="filter-section category-selection" style={{"--category-color": colors.food_shop} as CSSProperties}>
            <h3>Alimentation</h3>
            <div className="chip-group"><button aria-pressed={filters.organic} onClick={() => setFilters((f) => ({...f, organic: !f.organic}))}>Bio</button></div>
          </section>}
          <div className="filter-pair">
          <section className="filter-section">
            <h3>Accessibilité</h3>
            <div className="chip-group">
              <button
                aria-pressed={filters.pmr}
                onClick={() => setFilters((f) => ({ ...f, pmr: !f.pmr }))}
              >
                PMR
              </button>
            </div>
          </section>
          <section className="filter-section">
            <h3>Horaires</h3>
            <div className="chip-group">
              <button
                aria-pressed={filters.open}
                onClick={() => setFilters((f) => ({ ...f, open: !f.open }))}
              >
                Ouvert
              </button>
            </div>
          </section>
          </div>
          <section className="filter-section">
            <h3>Tarifs</h3>
            <div className="chip-group price-filters" role="group" aria-label="Tarifs">
              {([["free", "Gratuit"], ["paid", "Payant"], ["unknown", "Non renseigné"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  data-price={value}
                  aria-pressed={selectedPrices(filters).includes(value)}
                  onClick={() => setFilters(f => ({ ...f, prices: selectedPrices(f).includes(value) ? selectedPrices(f).filter(p => p !== value) : [...selectedPrices(f), value] }))}
                >{label}</button>
              ))}
            </div>
          </section>
          <section className="filter-section">
            <h3>Note minimale</h3>
            <div className="rating-input rating-filters" role="group" aria-label="Note minimale">
              {[1,2,3,4,5].map((rating) => <button type="button" key={rating} aria-label={`${rating} étoile${rating > 1 ? "s" : ""} minimum`} aria-pressed={filters.minRating === rating} onClick={() => setFilters((f) => ({...f, minRating: f.minRating === rating ? 0 : rating}))}><Star size={30} fill={rating <= filters.minRating ? "currentColor" : "none"} /></button>)}
            </div>
          </section>
          <section className="filter-section">
            <h3>Informations</h3>
            <div className="chip-group">
              <button aria-pressed={filters.recentlyValidated} onClick={() => setFilters((f) => ({...f, recentlyValidated: !f.recentlyValidated}))}>Validé &lt; 1 an</button>
              <button aria-pressed={filters.withPhotos} onClick={() => setFilters((f) => ({...f, withPhotos: !f.withPhotos}))}>Avec photos</button>
            </div>
          </section>
          <label className="radius-label">
            Distance maximale · {distanceLabel(filters.radius)}
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              aria-label="Distance maximale"
              aria-valuetext={distanceLabel(filters.radius)}
              value={radiusToSlider(filters.radius)}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  radius: radiusFromSlider(Number(e.target.value)),
                }))
              }
            />
            <span className="range-bounds">
              <span>100 m</span>
              <span>50 km</span>
            </span>
          </label>
          <div className="filter-footer">
            <button
              className="text-button"
              onClick={() => setFilters({ ...defaults })}
            >
              Réinitialiser
            </button>
            <button className="primary" onClick={() => setModal("")}>
              Voir {items.length.toLocaleString("fr-FR")}{" "}
              {screen === "favorites" ? "favoris" : "lieux"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
