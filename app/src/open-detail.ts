import {db,notify} from './store';
import {refreshFreePreviews,applyFreeChanges} from './free-sync';
import {fetchFreePlace,freeCollaborationEnabled,getFreeSession} from './free-cloud';
import {offlineMap} from './map-cache';
import {placeSourceIds,enrichCanonicalSources,sourcePatch} from './canonical-data';
import {loadOpenEnrichmentForPlaces} from './open-enrichment-loader';
import {detailIdentity,matchingPhotoPlace,type DetailSources} from './detail-sources';
import type {Place} from './types';
import {prepareCanonicalCatalog,canonicalizeImported} from './canonical-store';
let photoPlaces:Promise<Place[]>|undefined;
const requests=new Map<string,Promise<void>>();
/** Une ouverture explicite : fiche serveur puis tous les lots de photos, cache hors ligne conservé. */
export function loadOpenedDetail(id:string,force=false):Promise<void>{
 if(!freeCollaborationEnabled || offlineMap())return Promise.resolve();
 const pending=requests.get(id);if(pending)return pending;
 const request=loadIfStale(id,force).finally(()=>requests.delete(id));requests.set(id,request);return request;
}
async function loadIfStale(id:string,force:boolean){
 const cached=await db.meta.get(`detail-loaded:${id}`);
 const ttl=getFreeSession()?.isAdmin?5*60_000:24*60*60_000;
 if(!force && typeof cached?.value==='number' && Date.now()-cached.value<ttl)return;
 await load(id,force);
 await db.meta.put({key:`detail-loaded:${id}`,value:Date.now()});
}
async function load(id:string,force:boolean){
 await prepareCanonicalCatalog();await canonicalizeImported([id]);
 let place=await db.places.get(id);const visited=new Set<string>();
 while(place?.redirect&&!visited.has(place.id)){visited.add(place.id);place=await db.places.get(place.redirect);}
 if(!place || await db.removed.get(place.id))return;
 const root=place.id;
 const group=await db.catalogGroups.get(root);
 if(group){
  await loadOpenEnrichmentForPlaces(group.originals);
  const revisions=await db.sourceRevisions.bulkGet(group.originals.map(source=>source.id)),corrected=new Set<string>();
  for(let i=0;i<group.originals.length;i++)if(revisions[i])for(const key of Object.keys(sourcePatch(group.originals[i],revisions[i]!)))corrected.add(key);
  const enriched=enrichCanonicalSources(place,group.originals,corrected);
  if(enriched!==place){place=enriched;await db.places.put(place);}
 }
 // L'index embarqué identifie une photo publiée sur une autre source du même lieu.
 photoPlaces??=fetch('/open-photo-places.json').then(r=>{if(!r.ok)throw Error('Index des photos indisponible.');return r.json();}).catch(e=>{photoPlaces=undefined;throw e;});
 const sources=[...placeSourceIds(place)],match=matchingPhotoPlace(place,await photoPlaces);
 if(match&&!sources.includes(match))sources.push(match);
 const changes=[];let direct=false;
 for(const source of sources){const change=await fetchFreePlace(source);if(change){changes.push(change);if(source===root)direct=true;}}
 await applyFreeChanges(changes);
 place=await db.places.get(root);if(!place||await db.removed.get(root))return;
 // Une ancienne fiche locale conserve son identité et toutes ses corrections.
 // Seuls ses champs absents sont complétés par la source homonyme unique à moins de 40 m.
 if(!direct&&match){
  const extra=changes.find(c=>c.id===match&&!c.deleted)?.place;
  if(extra){
   const patch:Partial<Place>={};
   for(const key of ['hours','description','website','activity_type','age','wheelchair','changing_table','drinking_water','free','fenced','elevator','shade','shelter','bench'] as const){
    if((place[key]===undefined||place[key]===null||place[key]==='') && extra[key]!==undefined && extra[key]!==null)(patch as Record<string,unknown>)[key]=extra[key];
   }
   place={...place,...patch};await db.places.put(place);
  }
 }
 const record:DetailSources={identity:detailIdentity(place),sources};
 if(JSON.stringify((await db.meta.get(`detail-sources:${root}`))?.value)!==JSON.stringify(record))await db.meta.put({key:`detail-sources:${root}`,value:record});
 // Terminer une lecture antérieure avant de forcer la consultation explicite.
 await refreshFreePreviews(root,force);
 notify();
}
