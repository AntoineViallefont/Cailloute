import { db } from "./store";
import { canonicalCatalogVersion } from "./canonical-version";
import { canonicalDetail, migrateCanonicalPlace, sourcePatch, type CanonicalGroup } from "./canonical-data";
import { normalizePlace, protectedPlace } from "./place-rules";
import { enrichImported } from "./place-enrichment";
import type { Place, Detail } from "./types";
import {distance} from "./geo";
import {fetchCatalogAsset} from './catalog-assets';
type CanonicalTile={file:string;bounds:number[];count:number};
let tiles:CanonicalTile[]|undefined;
const tileRequests=new Map<string,Promise<{version:string;groups:CanonicalGroup[]}>>();
const decodedCanonicalTiles=new Map<string,{version:string;groups:CanonicalGroup[]}>();

// Installation du résultat calculé à la construction, jamais de rapprochement sur le téléphone.
export async function prepareCanonicalCatalog() {
  const saved=(await db.meta.get(`canonical-tiles:${canonicalCatalogVersion}`))?.value as CanonicalTile[]|undefined;
  if(saved){tiles=saved;return;}
  if((await db.meta.get("canonical-catalog"))?.value===canonicalCatalogVersion)return;
  const response=await fetch("/canonical-places.json",{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("Catalogue fusionné indisponible.");
  const data=await response.json() as {version:string;groups?:CanonicalGroup[];tiles?:CanonicalTile[]};
  if(data.version!==canonicalCatalogVersion)throw new Error("Version du catalogue fusionné incompatible.");
  if(data.tiles){tiles=data.tiles;await db.meta.put({key:`canonical-tiles:${canonicalCatalogVersion}`,value:tiles});await db.meta.put({key:'canonical-catalog',value:data.version});return;}
  await db.transaction("rw",["catalogGroups","catalogSources","meta"],async()=>{
    await db.catalogGroups.bulkPut(data.groups!);
    await db.catalogSources.bulkPut(data.groups!.flatMap(g=>g.originals.map(p=>({id:p.id,canonicalId:g.id,place:p}))));
    await db.meta.put({key:"canonical-catalog",value:data.version});
  });
}
async function prepareTiles(keys:string[],supplied?:Place[]):Promise<boolean>{
 if(!tiles)return true;
 const links=await db.catalogSources.bulkGet(keys);
 const known=(await db.catalogGroups.bulkGet([...new Set(links.flatMap(link=>link?[link.canonicalId]:[]))])).filter((g):g is CanonicalGroup=>!!g&&g.place.catalog_version===canonicalCatalogVersion);
 const installedRoots=new Set(known.map(g=>g.id));
 const wanted=new Set(keys.filter((_,i)=>!links[i]||!installedRoots.has(links[i]!.canonicalId)));
 if(!wanted.size)return true;
 const places=(supplied||(await db.places.bulkGet(keys)).filter((p):p is Place=>!!p)).filter(p=>wanted.has(p.id));
 const cells=new Map<string,Place[]>();
 for(const p of places){const key=`${Math.floor(p.lat*4)}_${Math.floor(p.lon*4)}`;const cell=cells.get(key)||[];cell.push(p);cells.set(key,cell);}
 const needed=tiles.filter(t=>{
  for(let y=Math.floor((t.bounds[1]-.005)*4);y<=Math.floor((t.bounds[3]+.005)*4);y++)for(let x=Math.floor((t.bounds[0]-.005)*4);x<=Math.floor((t.bounds[2]+.005)*4);x++)
   if(cells.get(`${y}_${x}`)?.some(p=>p.lon>=t.bounds[0]-.005&&p.lon<=t.bounds[2]+.005&&p.lat>=t.bounds[1]-.005&&p.lat<=t.bounds[3]+.005))return true;
  return false;
 });
 let complete=true;
 for(const tile of needed){
  const key=`canonical-tile:${canonicalCatalogVersion}:${tile.file}`;
  if(await db.meta.get(key))continue;
  try{
   let data=decodedCanonicalTiles.get(key);
   if(!data){
    let request=tileRequests.get(key);
    if(!request){request=(async()=>{
     const response=await fetchCatalogAsset(`/canonical/${tile.file}?v=${canonicalCatalogVersion}`);if(!response.ok)throw Error('Fusion des lieux indisponible.');
     const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer);
     const decoded=bytes[0]===31&&bytes[1]===139?new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))):new Response(buffer);
     const value=await decoded.json() as {version:string;groups:CanonicalGroup[]};if(value.version!==canonicalCatalogVersion)throw Error('Version de fusion incompatible.');
     decodedCanonicalTiles.set(key,value);if(decodedCanonicalTiles.size>8)decodedCanonicalTiles.delete(decodedCanonicalTiles.keys().next().value!);
     return value;
    })();tileRequests.set(key,request);}
    try{data=await request;}finally{if(tileRequests.get(key)===request)tileRequests.delete(key);}
   }
   // Installer seulement les fiches demandées, pas tous les lieux d'une grande zone nationale.
   const relevant=data.groups.filter(g=>g.originals.some(p=>wanted.has(p.id)));
   for(let offset=0;offset<relevant.length;offset+=200){
    const batch=relevant.slice(offset,offset+200);
    await db.transaction('rw',["catalogGroups","catalogSources"],async()=>{
     await db.catalogGroups.bulkPut(batch);await db.catalogSources.bulkPut(batch.flatMap(g=>g.originals.map(place=>({id:place.id,canonicalId:g.id,place}))));
    });
    await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
   // Une sélection partielle ne doit jamais faire croire que toute la zone est installée.
   if(relevant.length===data.groups.length)await db.meta.put({key,value:true});
  }catch(error){if(!navigator.onLine||localStorage.getItem('map-offline')==='true')complete=false;else throw error;}
 }
 return complete;
}
/** La distance de la fiche fusionnée fait foi, y compris près du bord du rayon. */
export async function canonicalPlacesInRadius(rows:Place[],origin:{lat:number;lon:number},radius:number):Promise<Place[]> {
  if(!rows.length)return rows;
  await prepareCanonicalCatalog();await prepareTiles(rows.map(p=>p.id),rows);
  const links=await db.catalogSources.bulkGet(rows.map(p=>p.id));
  const ids=[...new Set(links.flatMap(link=>link?[link.canonicalId]:[]))];
  const [groups,current]=await Promise.all([db.catalogGroups.bulkGet(ids),db.places.bulkGet(ids)]);
  const roots=new Map(ids.map((id,i)=>[id,current[i]||groups[i]?.place]));
  return rows.filter((row,i)=>distance(origin,(links[i]&&roots.get(links[i]!.canonicalId))||row)<=radius);
}
let migrating:Promise<void>|undefined;
export async function canonicalizeImported(ids?:string[]) {
  // Un seul passage d’installation même si plusieurs zones arrivent en parallèle.
  const task=(migrating??Promise.resolve()).catch(()=>{}).then(()=>install(ids));migrating=task;
  try{await task;}finally{if(migrating===task)migrating=undefined;}
}
async function install(ids?:string[]) {
  if(!ids&&(await db.meta.get("canonical-installed"))?.value===canonicalCatalogVersion)return;
  if(ids){
    const existing=await db.places.bulkGet(ids);
    if(existing.length && existing.every(p=>p?.catalog_version===canonicalCatalogVersion))return;
  }
  const keys=ids||await db.places.toCollection().primaryKeys();
  const complete=await prepareTiles(keys);
  const links=await db.catalogSources.bulkGet(keys);
  const groupIds=[...new Set(links.flatMap(s=>s?[s.canonicalId]:[]))];
  const current=await db.places.bulkGet(groupIds);
  const needed=groupIds.filter((id,i)=>current[i]?.catalog_version!==canonicalCatalogVersion);
  const groups=(await db.catalogGroups.bulkGet(needed)).filter((g):g is CanonicalGroup=>!!g&&g.place.catalog_version===canonicalCatalogVersion);
  if(!groups.length){if(!ids&&complete)await db.meta.put({key:"canonical-installed",value:canonicalCatalogVersion});return;}
  const personal = db.personal ? await db.personal.toArray() : [];
  const protectedIds=new Set(personal.filter(c=>c.createdLocally||c.informationEditedAt||Object.keys(c.patch).some(key=>!["verified_at","verified_by","information_validated","validated_at","validation_changed_at"].includes(key))).map(c=>c.id));
  await db.transaction("rw",["places","details","sourceRevisions","removed","meta"],async()=>{
    // Lecture et écriture par lots : éviter des milliers d’allers-retours IndexedDB.
    const affected=[...new Set(groups.flatMap(g=>g.originals.map(p=>p.id)))];
    const [storedRows,cachedRows,removed]=await Promise.all([db.places.bulkGet(affected),db.details.bulkGet(affected),db.removed.toCollection().primaryKeys()]);
    const stored=storedRows.filter((p):p is Place=>!!p),cached=cachedRows.filter((p):p is Detail=>!!p);
    const oldById=new Map(stored.map(p=>[p.id,p])), detailById=new Map(cached.map(p=>[p.id,p])), excluded=new Set(removed);
    const places:Place[]=[], details:Detail[]=[], revisions:Place[]=[];
    for(const group of groups) {
      // Une fiche créée ou explicitement modifiée reste indépendante des rapprochements d'import.
      if(group.originals.some(p=>protectedIds.has(p.id) || (oldById.has(p.id)&&(protectedPlace(oldById.get(p.id)!)||oldById.get(p.id)!.version>p.version))))continue;
      const aliases=group.originals.filter(p=>p.id!==group.id).map(p=>({...p,redirect:group.id}));
      if(excluded.has(group.id)) {places.push(...aliases);continue;}
      const sourceIds=group.originals.map(p=>p.id);
      const old=sourceIds.map(id=>oldById.get(id)).filter((p):p is Place=>!!p).map(p=>normalizePlace(enrichImported(p)));
      const previousDetails=sourceIds.map(id=>detailById.get(id)).filter((p):p is Detail=>!!p);
      const place=migrateCanonicalPlace(group,old);
      revisions.push(...old);
      const merged=canonicalDetail(place,previousDetails);
      places.push({...place,photo_count:merged.photo_count,review_count:merged.review_count,rating:merged.rating},...aliases);
      details.push(merged);
    }
    await db.sourceRevisions.bulkPut(revisions);
    await db.places.bulkPut(places);
    await db.details.bulkPut(details);
    await db.meta.bulkDelete(groups.map(g=>`free-previews:${g.id}`));
    if(!ids&&complete)await db.meta.put({key:"canonical-installed",value:canonicalCatalogVersion});
  });
}

// Compatibilité des anciennes contributions : transformation à la réception, pas à l’ouverture d’une fiche.
export async function receiveCanonicalSource(id:string, incoming:Place, reviews:Detail["reviews"]):Promise<boolean> {
  const link=await db.catalogSources.get(id);
  if(!link)return false;
  const root=await db.places.get(link.canonicalId);
  if(!root?.catalog_version || await db.removed.get(root.id))return false;
  const previous=(await db.sourceRevisions.get(id))||link.place;
  const changed=sourcePatch(previous,incoming);
  const place={...root,...changed,id:root.id,version:id===root.id?incoming.version:root.version};
  const cached=await db.details.get(root.id);
  const retained=(cached?.reviews||[]).filter(r=>(r.place_id||root.id)!==id);
  const combined=canonicalDetail(place,[{...place,photos:cached?.photos||[],reviews:retained},{...incoming,photos:[],reviews:reviews.map(r=>({...r,place_id:id}))}]);
  // Une fiche peut ne conserver que le premier lot de photos : garder le total serveur.
  combined.photo_count=Math.max(combined.photo_count||0,incoming.photo_count||0,root.photo_count||0);
  await db.places.put({...place,photo_count:combined.photo_count,review_count:combined.review_count,rating:combined.rating});
  await db.details.put(combined);
  await db.sourceRevisions.put(incoming);
  await db.meta.delete(`free-previews:${root.id}`);
  const epoch=Number((await db.meta.get(`preview-epoch:${root.id}`))?.value||0);
  await db.meta.put({key:`preview-epoch:${root.id}`,value:epoch+1});
  return true;
}
