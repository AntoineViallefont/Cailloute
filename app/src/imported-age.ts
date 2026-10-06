import type {Place} from './types';
// Réparer seulement l'ancien export d'une borne OSM unique, sans écraser une contribution.
export function importedAgeCorrection(existing:Place,incoming:Place):string|null {
 if(existing.category!=='playground'||incoming.category!=='playground'||existing.community||existing.version!==1)return null;
 const match=incoming.age?.match(/^(?:À partir de|Jusqu’à) (\d+(?:[.,]\d+)?) ans$/);
 if(!match || existing.age?.trim()!==match[1] || !existing.sources?.some(a=>a.key.startsWith('osm:') && incoming.sources?.some(b=>b.key===a.key)))return null;
 return incoming.age;
}
