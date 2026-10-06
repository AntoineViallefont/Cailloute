import {protectedPlace} from "./place-rules";
import data from "./data-enrichment-017.json";
import familyData from "./data-family-enrichment-017.json";
import type { Place } from "./types";
import { enrichOpenImported } from './open-enrichment';

// Enrichissement du catalogue avant les contributions : les corrections personnelles priment.
export function enrichImported<T extends Place>(place: T): T {
  if (protectedPlace(place)) return place;
  const first = (data as Record<string, Partial<Place>>)[place.id];
  const second = (familyData as Record<string, Partial<Place>>)[place.id];
  if (!first && !second) return enrichOpenImported(place);
  const extra = {...first, ...second};
  const result = {...place};
  for (const key of ["organic", "toilet_public", "changing_table", "wheelchair", "free"] as const) {
    if (result[key] == null && extra[key] !== undefined) result[key] = extra[key];
  }
  if (!result.transit_lines?.length && extra.transit_lines) result.transit_lines = extra.transit_lines;
  result.sources = [...new Map([...(place.sources || []), ...(first?.sources || []), ...(second?.sources || [])].map(s => [s.key, s])).values()];
  return enrichOpenImported(result);
}
