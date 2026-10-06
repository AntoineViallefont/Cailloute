import { mergePlaceData } from "./group-places";
import type { Place } from "./types";
export interface CatalogGroups {
  version: string;
  members: Record<string, { id: string; kind?: "nearby" | "station" }>;
}
// L'identité vient du catalogue complet, jamais des filtres ou du cache visible.
export function groupCatalogPlaces(places: Place[]): Place[] {
  const groups = new Map<string, Place[]>();
  const result: Place[] = [];
  for (const p of places) {
    if (p.deleted || p.redirect || p.withdrawn) continue;
    if (!p.catalog_group || p.community || p.id.startsWith("c_")) { result.push(p); continue; }
    const members = groups.get(p.catalog_group.id) || [];
    members.push(p); groups.set(p.catalog_group.id, members);
  }
  for (const members of groups.values()) {
    const group = members[0].catalog_group!;
    members.sort((a,b) => Number(b.id === group.id) - Number(a.id === group.id) || a.id.localeCompare(b.id));
    // Le repère utilise un membre réel chargé ; les opérations restent sur les IDs sources.
    result.push(members.length === 1 ? members[0] : { ...mergePlaceData(members), group_kind: group.kind });
  }
  return result;
}
