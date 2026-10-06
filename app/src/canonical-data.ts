import { uniquePhotos } from "./unique-photos";
import { latestReviews } from "./latest-reviews";
import { importedAgeCorrection } from "./imported-age";
import {enrichOpenImported,missingEnrichmentField,openEnrichmentFields} from './open-enrichment';
import type { Place, Detail, Photo, Review } from "./types";
export interface CanonicalGroup { id:string; place:Place; originals:Place[] }
export interface CatalogSource { id:string; canonicalId:string; place:Place }
export const placeSourceIds = (p:Place) => p.catalog_sources || (p.merged_members || [p]).map(m=>m.id);
/** Les compléments validés d'une source alias restent visibles sur la fiche fusionnée. */
export function enrichCanonicalSources(place:Place,originals:Place[],corrected:ReadonlySet<string>=new Set()):Place {
 if(place.community||place.deleted||place.withdrawn||place.redirect||place.version!==1)return place;
 let result=place;
 for(const original of originals){
  const extra=enrichOpenImported(original);if(extra===original)continue;
  for(const key of openEnrichmentFields){
   if(corrected.has(key)||place.merged_conflicts?.includes(key)||!missingEnrichmentField(key,result[key])||missingEnrichmentField(key,extra[key]))continue;
   if(result===place)result={...place};(result as unknown as Record<string,unknown>)[key]=extra[key];
  }
  if(result!==place)result.sources=[...new Map([...(result.sources||[]),...(extra.sources||[])].map(source=>[source.key,source])).values()];
 }
 return result;
}
// Les métadonnées et les champs calculés ne constituent pas une correction de la fiche.
const fields = ["name","category","lat","lon","address","city","hours","description","website","activity_type","health_type","pediatric","baby_food","organic","toilet_public","children_clothes","shop_type","information_validated","validated_at","validation_changed_at","age","access","transit_modes","transit_lines","toilets_available","wheelchair","changing_table","drinking_water","free","fenced","elevator","shade","shelter","bench","condition","condition_observed_at"] as const;
export function sourcePatch(previous:Place, next:Place):Partial<Place> {
  return Object.fromEntries(fields.filter(k=>next[k]!==undefined && JSON.stringify(previous[k])!==JSON.stringify(next[k])).map(k=>[k,next[k]]));
}
export function migrateCanonicalPlace(group:CanonicalGroup, existing:Place[]):Place {
  let place={...group.place};
  const old=new Map(existing.map(p=>[p.id,p]));
  // Les corrections connues sont appliquées une fois, sans refaire la règle de rapprochement.
  for(const original of group.originals) {
    const current=old.get(original.id);
    if(current){const patch=sourcePatch(original,current);if(importedAgeCorrection(current,original))delete patch.age;place={...place,...patch};}
  }
  return {...place,id:group.id,version:old.get(group.id)?.version ?? place.version};
}
export function canonicalDetail(place:Place, details:Detail[]):Detail {
  const photos = new Map<string,Photo>(), reviews = new Map<string,Review>();
  for(const d of details) {
    for(const p of d.photos)photos.set(p.id,{...p,place_id:p.place_id||d.id});
    for(const r of d.reviews){const source=r.place_id||d.id;reviews.set(`${source}:${r.id}`,{...r,place_id:source});}
  }
  const list=latestReviews([...reviews.values()]);
  const unique = uniquePhotos([...photos.values()]);
  return {...place,photos:[...photos.values()],reviews:list,photo_count:unique.length,
    review_count:list.length,rating:list.length?list.reduce((sum,r)=>sum+r.stars,0)/list.length:place.rating};
}
