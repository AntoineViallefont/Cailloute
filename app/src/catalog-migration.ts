import {protectedPlace} from "./place-rules";
import type { Place } from "./types";
import type { CatalogGroups } from "./catalog-groups";
import { compatiblePlaceIdentity, groupingDistance,sameVenue, PROXIMITY_MERGE_METRES } from "./place-match";
import { distance } from "./geo";

// Migration explicite du catalogue initial : les anciens groupes restent indivisibles.
// Aucune utilisation lors de l’ajout ou de la modification d’une contribution.
export function mergeInitialGroups(places: Place[], previous: CatalogGroups["members"]) {
  const members = structuredClone(previous);
  const units = new Map<string, Place[]>();
  for (const p of places) {
    if (protectedPlace(p) || p.deleted || p.redirect || p.withdrawn) continue;
    const id = members[p.id]?.id || p.id;
    units.set(id, [...(units.get(id) || []), p]);
  }
  const aliases = new Map<string,string>();
  const cells = new Map<string, {id:string; places:Place[]}[]>();
  for (const [id, unit] of [...units].sort(([a],[b])=>a.localeCompare(b))) {
    const p = unit[0];
    const x=Math.floor(p.lat*111000/100), y=Math.floor(p.lon*78000/100);
    const candidates = [];
    for(let dx=-3;dx<=3;dx++) for(let dy=-5;dy<=5;dy++)
      candidates.push(...(cells.get(`${p.category}:${x+dx}:${y+dy}`)||[]));
    const target = candidates.sort((a,b)=>distance(p,a.places[0])-distance(p,b.places[0]) || a.id.localeCompare(b.id))
      .find(g=>unit.every(a=>g.places.every(b=>sameVenue(a,b) || compatiblePlaceIdentity(a,b) && distance(a,b)<=Math.max(PROXIMITY_MERGE_METRES,groupingDistance[a.category]))));
    if(target) { target.places.push(...unit); aliases.set(id,target.id); }
    else {
      const key=`${p.category}:${x}:${y}`;
      cells.set(key,[...(cells.get(key)||[]),{id,places:[...unit]}]);
    }
  }
  // Inclut aussi les anciens IDs momentanément absents du catalogue.
  for(const [source,g] of Object.entries(members)) if(aliases.has(g.id))
    members[source]={id:aliases.get(g.id)!,kind:"nearby"};
  return members;
}
