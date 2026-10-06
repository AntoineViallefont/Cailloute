import {registerOpenEnrichment,type OpenEnrichment} from './open-enrichment';
import type {Place} from './types';
/** Fichiers embarqués chargés seulement dans les secteurs consultés. */
export function createOpenEnrichmentLoader(
 read:(path:string)=>Promise<unknown>=async path=>{const response=await fetch(path,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Complément indisponible');return response.json();},
 register:(patches:Record<string,OpenEnrichment>)=>void=registerOpenEnrichment,
){
 let manifest:Promise<{schema:1;version:string;tiles:string[]}>|undefined;
 const loaded=new Map<string,Promise<void>>();
 return async(places:Pick<Place,'lat'|'lon'>[])=>{
  if(!places.length)return;
  try{
   const index=await(manifest||=(async()=>{const value=await read('/enrichment/index.json') as {schema:1;version:string;tiles:string[]};if(value.schema!==1||!Array.isArray(value.tiles)||value.tiles.some(key=>!/^\d{2}_-?\d{1,2}$/.test(key)))throw new Error('Index invalide');return value;})().catch(error=>{manifest=undefined;throw error;}));
   const available=new Set(index.tiles);
   const keys=[...new Set(places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>`${Math.floor(p.lat)}_${Math.floor(p.lon)}`))].filter(key=>available.has(key));
   await Promise.all(keys.map(key=>{
    let task=loaded.get(key);
    if(!task){task=read(`/enrichment/${key}.json?v=${encodeURIComponent(index.version)}`).then(value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Complément invalide');register(value as Record<string,OpenEnrichment>);}).catch(()=>{loaded.delete(key);});loaded.set(key,task);}
    return task;
   }));
  }catch{/* Les données déjà disponibles restent utilisables si un fichier manque. */}
 };
}
export const loadOpenEnrichmentForPlaces=createOpenEnrichmentLoader();
