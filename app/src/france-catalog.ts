import {canonicalCatalogVersion} from "./canonical-version";
import {Capacitor} from "@capacitor/core";
import { fetchCatalogAsset } from "./catalog-assets";
import { importedAgeCorrection } from "./imported-age";
import { canonicalizeImported, canonicalPlacesInRadius } from "./canonical-store";
import { db, notify } from "./store";
import { distance } from "./geo";
import { inFrance } from "./france";
import { offlineMap } from "./map-cache";
import type { Place } from "./types";
type Tile = {file: string; bounds: number[]; count: number; hash?:string; baselineHash?:string};
let catalog: Promise<{version: string; hashBaselineVersion?:string; tiles: Tile[]}> | undefined;
let lastNotify=0;
const active = new Map<string,Promise<void>>();
// Réutiliser les fichiers décodés pendant les passages successifs, sans garder tout le pays en mémoire.
const decodedTiles = new Map<string,Place[]>();
export const progressiveRadii = (radius:number) => [...new Set([250,1000,2000,5000,10000,20000,50000].map(r=>Math.min(r,Math.min(50000,Math.max(100,radius)))))];
export async function loadFranceProgressively(bounds: {west:number;south:number;east:number;north:number}, cancelled:()=>boolean, origin:{lat:number;lon:number}, radius:number, onProgress:()=>void=()=>{}) {
  for(const step of progressiveRadii(radius)) {
    if(cancelled())return;
    await loadFranceBounds(bounds,cancelled,origin,step);
    if(cancelled())return;
    onProgress();
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
}
export async function loadFranceBounds(bounds: {west:number; south:number; east:number; north:number}, cancelled:()=>boolean=()=>false, priority={lat:(bounds.south+bounds.north)/2,lon:(bounds.west+bounds.east)/2},requestedRadius=50_000) {
  const radius=Math.min(50_000,Math.max(100,requestedRadius));
  if(offlineMap() && !Capacitor.isNativePlatform()) throw new Error("Reconnectez-vous pour télécharger les lieux de cette zone.");
  catalog ??= fetchCatalogAsset("/france/index.json").then(r=>{if(!r.ok)throw new Error("Catalogue France indisponible.");return r.json();}).catch(e=>{catalog=undefined;throw e;});
  const index=await catalog;
  // Distance au bord le plus proche, puis au centre : la zone immédiate passe en premier.
  const ranked=index.tiles.filter(t=>t.bounds[0]<=bounds.east && t.bounds[2]>=bounds.west && t.bounds[1]<=bounds.north && t.bounds[3]>=bounds.south).map(tile=>({tile,
    near:(()=>{
      const lon=Math.max(tile.bounds[0],Math.min(tile.bounds[2],priority.lon)),rad=Math.PI/180;
      const closestLat=Math.atan2(Math.sin(priority.lat*rad),Math.cos(priority.lat*rad)*Math.cos((lon-priority.lon)*rad))/rad;
      return distance(priority,{lat:Math.max(tile.bounds[1],Math.min(tile.bounds[3],closestLat)),lon});
    })(),
    centre:distance(priority,{lat:(tile.bounds[1]+tile.bounds[3])/2,lon:(tile.bounds[0]+tile.bounds[2])/2})
  })).filter(r=>r.near<=radius).sort((a,b)=>a.near-b.near || a.centre-b.centre || a.tile.file.localeCompare(b.tile.file));
  const tiles=ranked.map(r=>r.tile);
  let changed=false;
  const pendingRows=new Map<string,Place>();
  const scopes:{key:string;value:unknown;remaining:Set<string>}[]=[];
  const flush=async(limit:number)=>{
    // Un fichier proche peut contenir des lieux lointains : comparer aussi aux fichiers suivants.
    const ready=[...pendingRows.values()].map(p=>({p,metres:distance(priority,p)})).filter(r=>r.metres<=limit).sort((a,b)=>a.metres-b.metres||a.p.id.localeCompare(b.p.id)).map(r=>r.p);
    for(let offset=0;offset<ready.length;offset+=200){
      if(cancelled())throw new Error("Téléchargement interrompu. Les données déjà enregistrées sont conservées.");
      const batch=ready.slice(offset,offset+200);
      await db.transaction("rw",["places","removed","meta"],async()=>{
        const keys=batch.map(p=>p.id);
        const existing=await db.places.bulkGet(keys), excluded=await db.removed.bulkGet(keys);
        await db.places.bulkAdd(batch.filter((p,i)=>!existing[i]&&!excluded[i]));
        const repaired=batch.flatMap((p,i)=>{const old=existing[i];const age=old&&!excluded[i]?importedAgeCorrection(old,p):null;return age?[{...old!,age}]:[];});
        if(repaired.length)await db.places.bulkPut(repaired);
      });
      await canonicalizeImported(batch.map(p=>p.id));
      for(const p of batch){pendingRows.delete(p.id);for(const scope of scopes)scope.remaining.delete(p.id);}
      for(let i=scopes.length-1;i>=0;i--)if(!scopes[i].remaining.size){const scope=scopes[i];await db.meta.put({key:scope.key,value:scope.value});scopes.splice(i,1);}
      if(!changed || performance.now()-lastNotify>700){lastNotify=performance.now();notify();}
      changed=true;
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
  };
  for(const [tileIndex,tile] of tiles.entries()){
    if(cancelled()) throw new Error("Téléchargement interrompu. Les données déjà enregistrées sont conservées.");
    const key=tile.hash?`france-scope-v3:${canonicalCatalogVersion}:${tile.file}:${tile.hash}`:`france-scope-v3:${canonicalCatalogVersion}:${index.version}:${tile.file}`;
    const previous=active.get(key);
    const task=(async()=>{
      // Sérialiser la vérification du cache et l’import pour ce fichier.
      if(previous)await previous.catch(()=>{});
      if(cancelled())throw new Error("Téléchargement interrompu. Les données déjà enregistrées sont conservées.");
      const saved=(await db.meta.get(key))?.value as true|{circles:{lat:number;lon:number;radius:number}[]}|undefined;
      const circles=saved===true?[]:saved?.circles||[];
      if(saved===true || circles.some(c=>distance(c,priority)+radius<=c.radius+.01))return;
      let allRows=decodedTiles.get(key);
      if(!allRows){
        const response=await fetchCatalogAsset(`/france/${tile.file}${tile.hash?`?v=${tile.hash}`:""}`);
        if(!response.ok)throw new Error("Chargement des lieux interrompu. Réessayez avec une connexion.");
        allRows=await response.json() as Place[];
        decodedTiles.set(key,allRows);
        if(decodedTiles.size>8)decodedTiles.delete(decodedTiles.keys().next().value!);
      }
      const candidates=allRows.map(p=>({p,metres:distance(priority,p)})).filter(r=>r.metres<=radius).sort((a,b)=>a.metres-b.metres).map(r=>r.p);
      const rows=await canonicalPlacesInRadius(candidates,priority,radius);
      // Une importation partielle ne doit pas masquer les lieux d’un futur rayon plus grand.
      const value=rows.length===allRows.length?true:{circles:[...circles.filter(c=>!(distance(c,priority)+c.radius<=radius)),{...priority,radius}].slice(-8)};
      for(const p of rows)pendingRows.set(p.id,p);
      scopes.push({key,value,remaining:new Set(rows.map(p=>p.id))});
      if(!rows.length)await db.meta.put({key,value});
      await flush(ranked[tileIndex+1]?.near ?? Infinity);
    })();active.set(key,task);try{await task;}finally{if(active.get(key)===task)active.delete(key);}
  }
  await flush(Infinity);
  if(changed)notify();
  return tiles.reduce((sum,t)=>sum+t.count,0);
}
export async function loadFranceArea(center: {lat: number; lon: number},cancelled:()=>boolean=()=>false) {
  if(!inFrance(center) || (offlineMap() && !Capacitor.isNativePlatform())) return;
  return loadFranceBounds({west:center.lon-.12,east:center.lon+.12,south:center.lat-.08,north:center.lat+.08},cancelled,center);
}
