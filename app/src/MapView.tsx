import type { PlaceBounds } from "./store";
import { RouteOverlay } from "./TransitRoutes";
import type { TransitRoute } from "./transit-routes";
import { categoryInk } from "./types";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MapContainer,
  ScaleControl,
  Marker,
  CircleMarker,
  useMap,
  useMapEvents,
} from "./leaflet-react";
import L from "leaflet";

import { MapLayers } from "./MapLayers";
import Supercluster from "supercluster";
import {
  MapPin,
  Baby,
  Droplet,
  TrainFront,
  ShoppingCart,
  Store,
  FerrisWheel,
  Drama,
  HeartPulse,
  Toilet,
} from "lucide-react";
import { allowedModes } from "./place-rules";
import { transitLetters } from "./types";
import { colors, type Category, type Place, type Origin } from "./types";
export const categoryIcons = {
  other: MapPin,
  child_activity: Drama,
  health: HeartPulse,
  playground: FerrisWheel,
  toilet: Toilet,
  water: Droplet,
  baby_shop: Store,
  food_shop: ShoppingCart,
  transit: TrainFront,
  changing_table: Baby,
};
export function PlaceSymbol({
  place,
  size = 23,
}: {
  place: Place;
  size?: number;
}) {
  const mode = allowedModes(place)[0];
  const Icon = categoryIcons[place.category];
  return place.category === "transit" && mode ? (
    <b className="transit-letter" style={{ fontSize: size }}>
      {transitLetters[mode]}
    </b>
  ) : (
    <Icon size={size} />
  );
}
const positionIcon = L.divIcon({className:"position-marker",html:'<span aria-label="Votre position"></span>',iconSize:[20,20],iconAnchor:[10,10]});
const icons: Record<string, L.DivIcon> = {};
function markerIcon(p: Place) {
  const c = p.category,
    key = c + ":" + allowedModes(p).join(",");
  if (!icons[key]) {
    icons[key] = L.divIcon({
      className: "poi-marker",
      html: renderToStaticMarkup(
        <span style={{ background: colors[c], color: categoryInk(c) }}>
          <PlaceSymbol place={p} size={14} />
        </span>,
      ),
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }
  return icons[key]!;
}
const clusterIcons=new Map<number,L.DivIcon>();
function clusterIcon(count:number){
  let icon=clusterIcons.get(count);
  if(!icon){
    icon=L.divIcon({className:"cluster",html:`<span title="${count} lieux">${count>999?Math.round(count/1000)+"k":count}</span>`,iconSize:[44,44],iconAnchor:[22,22]});
    if(clusterIcons.size>=256)clusterIcons.delete(clusterIcons.keys().next().value!);
    clusterIcons.set(count,icon);
  }
  return icon;
}
function Content({
  places,
  origin,
  onSelect,
  onCenter,
  target,
  selection,
}: {
  places: Place[];
  target?: Place | null;
  selection?: Place | null;
  origin: Origin;
  onSelect: (p: Place) => void;
  onCenter: (p: { lat: number; lon: number; bounds?:PlaceBounds }, userMoved?:boolean) => void;
}) {
  const map = useMap();
  const firstOrigin = useRef(true);
  const userMoved = useRef(false);
  useEffect(() => {
    const node=map.getContainer();
    const mark=()=>{userMoved.current=true;};
    for(const event of ["wheel","dblclick","touchmove"])node.addEventListener(event,mark,{passive:true});
    return()=>{for(const event of ["wheel","dblclick","touchmove"])node.removeEventListener(event,mark);};
  },[map]);
  const [view, setView] = useState(0);
  const saveViewport = () => {
    const bounds = map.getBounds();
    localStorage.setItem(
      "mapViewport",
      JSON.stringify({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
        zoom: map.getZoom(),
      }),
    );
  };
  useEffect(() => {
    saveViewport();
    const c = map.getCenter();
    onCenter({ lat: c.lat, lon: c.lng, bounds:{south:map.getBounds().getSouth(),north:map.getBounds().getNorth(),west:map.getBounds().getWest(),east:map.getBounds().getEast()} });
  }, [map]);
  useMapEvents({
    resize: saveViewport,
    dragstart:()=>{userMoved.current=true;},
    moveend: () => {
      saveViewport();
      setView((v) => v + 1);
      const c = map.getCenter();
      onCenter({ lat: c.lat, lon: c.lng, bounds:{south:map.getBounds().getSouth(),north:map.getBounds().getNorth(),west:map.getBounds().getWest(),east:map.getBounds().getEast()} },userMoved.current);
      userMoved.current=false;
      localStorage.setItem(
        "mapView",
        JSON.stringify([c.lat, c.lng, map.getZoom()]),
      );
    },
  });
  useEffect(() => {
    if (firstOrigin.current) {
      firstOrigin.current = false;
      return;
    }
    if (!origin.chosen) return;
    const target = L.latLng(origin.lat, origin.lon);
    // Ne pas lancer un vol vers le centre déjà affiché : il fait osciller le zoom.
    if (map.getCenter().distanceTo(target) < 1 && map.getZoom() === 18) return;
    userMoved.current=false;
    map.stop();
    map.setView(target, 18, { animate: false });
  }, [origin.chosen, origin.lat, origin.lon, map]);
  useEffect(() => {
    if (!target || selection) return;
    userMoved.current=false;
    map.stop();
    map.panTo([target.lat, target.lon], {
      animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      duration: 0.55,
    });
  }, [target, map]);
  useEffect(() => {
    if (!selection) return;
    const frame = requestAnimationFrame(() => {
      const rect = map.getContainer().getBoundingClientRect();
      const searchBottom =
        document.querySelector(".search-area")?.getBoundingClientRect()
          .bottom ?? rect.top;
      const top = Math.max(rect.top, searchBottom);
      const bottom = Math.min(rect.bottom, window.innerHeight / 2);
      if (bottom <= top) return;
      const desired = L.point(rect.width / 2, (top + bottom) / 2 - rect.top);
      const center = map
        .project([selection.lat, selection.lon], map.getZoom())
        .add(map.getSize().divideBy(2).subtract(desired));
      userMoved.current=false;
      map.stop();
      map.panTo(map.unproject(center, map.getZoom()), {
        animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        duration: 0.55,
        easeLinearity: 0.25,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection, map]);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false, debounceMoveend: true }),
    );
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  // Les photos et textes ne changent pas la géométrie des repères.
  const geometryKey = useMemo(()=>JSON.stringify(places.map(p=>[p.id,p.lon,p.lat,p.category])),[places]);
  const index = useMemo(
    () =>
      new Supercluster<{ id: string; category: Category }>({
        radius: 40,
        extent: 256,
        maxZoom: 18,
      }).load(
        places.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: { id: p.id, category: p.category },
        })),
      ),
    [geometryKey],
  );
  const lookup = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const bounds = map.getBounds();
  const boundsKey=[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()].join(",");
  const zoom=Math.floor(map.getZoom());
  const clusters = useMemo(()=>index.getClusters(
    [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],zoom
  ),[index,boundsKey,zoom,view]);
  return (
    <>
      {clusters.map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        if ("cluster" in p && p.cluster) {
          const count = p.point_count;
          return (
            <Marker
              key={"c" + p.cluster_id}
              position={[lat, lon]}
              icon={clusterIcon(count)}
              eventHandlers={{
                click: () => {
                  userMoved.current=false;
      map.stop();
                  map.flyTo([lat, lon], Math.min(map.getMaxZoom(), index.getClusterExpansionZoom(p.cluster_id)), {duration: 0.28, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches});
                },
              }}
            />
          );
        }
        const place = lookup.get(p.id);
        if (!place) return null;
        return (
          <Marker
            key={p.id}
            position={[lat, lon]}
            title={place.name}
            alt={place.name}
            icon={markerIcon(place)}
            eventHandlers={{ click: () => onSelect(place) }}
          />
        );
      })}
      {origin.chosen && (
        <Marker
          position={[origin.lat, origin.lon]}
          interactive={false}
          zIndexOffset={1000}
          icon={positionIcon}
        />
      )}
    </>
  );
}
export const MapView = memo(function MapView(props: {
  routes: TransitRoute[];
  routeStop?: Place | null;
  places: Place[];
  target?: Place | null;
  origin: Origin;
  aerial: boolean;
  onSelect: (p: Place) => void;
  onCenter: (p: { lat: number; lon: number; bounds?:PlaceBounds }, userMoved?:boolean) => void;
}) {
  const initial = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mapView") || "null");
      return Array.isArray(saved) &&
        saved.length === 3 &&
        saved.every(Number.isFinite)
        ? [
            props.target?.lat ?? saved[0],
            props.target?.lon ?? saved[1],
            Math.max(5, Math.min(22, saved[2])),
          ]
        : [
            props.target?.lat ?? props.origin.lat,
            props.target?.lon ?? props.origin.lon,
            17,
          ];
    } catch {
      return [45.7578, 4.832, 17];
    }
  }, []);
  return (
    <MapContainer
      center={[initial[0], initial[1]]}
      zoom={initial[2]}
      minZoom={5}
      maxZoom={22}
      zoomControl={false}
      attributionControl={false}
      fadeAnimation={false}
      maxBounds={[
        [40, -6],
        [52, 11],
      ]}
      className={props.aerial ? "map aerial" : "map street"}
    >
      <MapLayers satellite={props.aerial} />
      <ScaleControl position="bottomleft" imperial={false} maxWidth={90} />
      <Content {...props} selection={props.routeStop} />
      <RouteOverlay routes={props.routes} />
      {props.routeStop && (
        <CircleMarker
          center={[props.routeStop.lat, props.routeStop.lon]}
          radius={8}
          pathOptions={{
            color: "#fff",
            weight: 3,
            fillColor: colors[props.routeStop.category],
            fillOpacity: 1,
            interactive: false,
          }}
        />
      )}
    </MapContainer>
  );
});
