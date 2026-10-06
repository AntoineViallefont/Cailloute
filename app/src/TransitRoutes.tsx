import { fetchCatalogAsset } from "./catalog-assets";
import { useEffect, useState } from "react";
import { Polyline } from "./leaflet-react";
import { routesForStop, type TransitRoute } from "./transit-routes";
import type { Place } from "./types";
let catalog: Promise<TransitRoute[]> | undefined;
function loadRoutes() {
  return (catalog ||= fetch("/transit-routes.json")
    .then((response) => {
      if (!response.ok) throw new Error("Tracés indisponibles");
      return response.json();
    })
    .then((data) => data.routes as TransitRoute[])
    .catch((error) => {
      catalog = undefined;
      throw error;
    }));
}
const feeds = new Map<string,Promise<TransitRoute[]>>();
async function loadNationalRoutes(place:Place) {
 const ids=[...new Set(place.sources.flatMap(s=>s.key.startsWith("gtfs:")?[s.key.split(":")[1]]:[]))].filter(id=>/^[a-f0-9-]{36}$/.test(id));
 const lines=[...new Set(place.transit_lines||[])];
 const requests=await Promise.all(lines.map(async line=>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(line));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("").slice(0,16);
  return ids.map(id=>{
   const key=`${id}/${hash}`;let task=feeds.get(key);
   if(!task){task=fetchCatalogAsset(`/transit-france/${key}.json`).then(r=>{if(!r.ok)throw new Error("Tracés indisponibles");return r.json();}).then(d=>d.routes as TransitRoute[]).catch(e=>{feeds.delete(key);throw e;});feeds.set(key,task);if(feeds.size>80)feeds.delete(feeds.keys().next().value!);}
   return task;
  });
 }));
 const results=await Promise.allSettled(requests.flat());
 return results.flatMap(r=>r.status==="fulfilled"?r.value:[]);
}
export function useTransitRoutes(place?: Place | null) {
  const [state, setState] = useState<{
    place?: Place | null;
    routes: TransitRoute[];
    loading: boolean;
  }>({ routes: [], loading: false });
  useEffect(() => {
    if (!place || place.category !== "transit") {
      setState({ place, routes: [], loading: false });
      return;
    }
    let active = true;
    setState({ place, routes: [], loading: true });
    Promise.allSettled([loadRoutes(),loadNationalRoutes(place)]).then(results=>results.flatMap(r=>r.status==="fulfilled"?r.value:[]))
      .then((routes) => {
        if (active)
          setState({
            place,
            routes: routesForStop(routes, place),
            loading: false,
          });
      })
      .catch(() => {
        if (active) setState({ place, routes: [], loading: false });
      });
    return () => {
      active = false;
    };
  }, [place]);
  return state.place === place ? state : { routes: [], loading: !!place };
}
export function RouteOverlay({ routes }: { routes: TransitRoute[] }) {
  return (
    <>
      {routes.map((route) => (
        <Polyline
          key={route.id}
          positions={route.paths}
          pathOptions={{
            color: route.color,
            weight: 5,
            opacity: 0.85,
            interactive: false,
          }}
        />
      ))}
    </>
  );
}
