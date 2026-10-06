import {protectedPlace} from "./place-rules";
import type {Place, Source} from './types';

export const openEnrichmentFields = ['hours','website','description','age','wheelchair','changing_table','free','organic','drinking_water'] as const;
export type EnrichmentField = typeof openEnrichmentFields[number];
export interface OpenEnrichment {
  approved: true;
  baseVersion: number;
  expected: Partial<Pick<Place, EnrichmentField>>;
  patch: Partial<Pick<Place, EnrichmentField>>;
  sources: Source[];
}
const approved:Record<string,OpenEnrichment>=Object.create(null);
export function registerOpenEnrichment(patches:Record<string,OpenEnrichment>){Object.assign(approved,patches);}
export const missingEnrichmentValue = (value:unknown) => value == null || typeof value === 'string' && !value.trim();
const tourismPlaceholder="Vérifiez auprès du lieu les âges, horaires et conditions d’accès.";
export const missingEnrichmentField=(key:EnrichmentField,value:unknown)=>missingEnrichmentValue(value)||key==='description'&&value===tourismPlaceholder;
export function validEnrichmentValue(key:EnrichmentField,value:unknown):boolean {
  if (['wheelchair','changing_table','free','organic','drinking_water'].includes(key)) return typeof value === 'boolean';
  if (typeof value !== 'string' || !value.trim()) return false;
  const maximum = key === 'hours' ? 500 : key === 'description' ? 2000 : key === 'age' ? 100 : 300;
  if (value.length > maximum) return false;
  if (key === 'website') { try { const url=new URL(value); return ['https:','http:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password; } catch {return false;} }
  return true;
}

/** Complément préparé hors du téléphone ; les contributions et corrections priment. */
export function enrichOpenImported<T extends Place>(place:T, patches:Record<string,OpenEnrichment> = approved):T {
  const extra = patches[place.id];
  if (!extra?.approved || protectedPlace(place) || place.community || place.deleted || place.withdrawn || place.redirect || place.version !== extra.baseVersion) return place;
  let result:T = place;
  for (const key of openEnrichmentFields) {
    const proposed = extra.patch[key];
    if (!Object.hasOwn(extra.expected,key) || !Object.hasOwn(extra.patch,key) || !validEnrichmentValue(key,proposed)) continue;
    if (!missingEnrichmentField(key,place[key]) || !missingEnrichmentField(key,extra.expected[key]) || missingEnrichmentValue(proposed)) continue;
    if (result === place) result = {...place};
    (result as Place)[key] = proposed as never;
  }
  if (result !== place) result.sources = [...new Map([...(place.sources||[]),...extra.sources].map(s=>[s.key,s])).values()];
  return result;
}
