import Dexie, { type EntityTable } from "dexie";
export type MapStyle = "aerial" | "plan";
export type Tile = { style: MapStyle; z: number; x: number; y: number };
type CachedTile = Tile & {
  key: string;
  blob: Blob;
  used: number;
  pinned: number;
};
class MapDB extends Dexie {
  tiles!: EntityTable<CachedTile, "key">;
  constructor() {
    super("CaillouteMaps");
    this.version(1).stores({ tiles: "key,used,pinned" });
    this.version(2).stores({ tiles: "key,used,pinned,[style+z+x+y]" });
  }
}
export const mapDB = new MapDB();
export const tileKey = (t: Tile) => `${t.style}/${t.z}/${t.x}/${t.y}`;
export const offlineMap = () =>
  localStorage.getItem("map-offline") === "true" || !navigator.onLine;
export function setOfflineMap(value: boolean) {
  localStorage.setItem("map-offline", String(value));
  window.dispatchEvent(new Event("map-mode"));
}
export function tileURL(t: Tile) {
  const layer =
    t.style === "aerial"
      ? "ORTHOIMAGERY.ORTHOPHOTOS"
      : "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2";
  return `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=image/${t.style === "aerial" ? "jpeg" : "png"}&TILEMATRIXSET=PM&TILEMATRIX=${t.z}&TILEROW=${t.y}&TILECOL=${t.x}`;
}
const pending = new Map<
  string,
  {
    promise: Promise<Blob | undefined>;
    consumers: Set<() => boolean>;
  }
>();
const memory = new Map<string, Blob>();
const touched = new Map<string, number>();
const reading = new Map<string, Promise<Blob | undefined>>();
const decoded = new Map<string, {blob:Blob; image:ImageBitmap}>();
const decoding = new Map<string, Promise<ImageBitmap>>();
// 96 tuiles décodées : environ 24 Mio, sans redécodage pendant les gestes.
async function tileBitmap(key: string, blob: Blob): Promise<ImageBitmap> {
  const hot=decoded.get(key);
  if(hot?.blob===blob){decoded.delete(key);decoded.set(key,hot);return hot.image;}
  const active=decoding.get(key);if(active)return active;
  const task=createImageBitmap(blob).then(image=>{
    decoded.set(key,{blob,image});
    setTimeout(()=>{while(decoded.size>96){const first=decoded.keys().next().value!;decoded.get(first)!.image.close();decoded.delete(first);}},0);
    return image;
  }).finally(()=>decoding.delete(key));
  decoding.set(key,task);return task;
}
export const MAP_CACHE_MAX_BYTES = 200 * 1024 * 1024;
export const MAP_CACHE_MAX_TILES = 6000;
function touch(key: string) {
  const now = Date.now();
  if (now - (touched.get(key) || 0) < 5 * 60_000) return;
  touched.delete(key); touched.set(key, now);
  if (touched.size > MAP_CACHE_MAX_TILES) touched.delete(touched.keys().next().value!);
  void mapDB.tiles.update(key, { used: now }).catch(() => {});
}
const failed = new Map<string, number>();
let running = 0,
  writes = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>) {
  if (running >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
  else running++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}
function remember(key: string, blob: Blob) {
  memory.delete(key);
  memory.set(key, blob);
  if (memory.size > 500) memory.delete(memory.keys().next().value!);
}
export async function cachedTile(t: Tile): Promise<Blob | undefined> {
  const key=tileKey(t),hot=memory.get(key);
  if(hot){remember(key,hot);touch(key);return hot;}
  const active=reading.get(key);if(active)return active;
  const task=mapDB.tiles.get(key).then(row=>{
    if(row){remember(key,row.blob);touch(key);return row.blob;}
    return undefined;
  }).catch(()=>undefined).finally(()=>reading.delete(key));
  reading.set(key,task);return task;
}
async function cachedParents(t: Tile): Promise<{tile:Tile;blob:Blob}[]> {
  const parents=Array.from({length:Math.min(8,t.z)},(_,i)=>{
    const level=i+1,factor=2**level;
    return {...t,z:t.z-level,x:Math.floor(t.x/factor),y:Math.floor(t.y/factor)};
  });
  const missing=parents.filter(p=>!memory.has(tileKey(p)));
  const rows=missing.length?await mapDB.tiles.bulkGet(missing.map(tileKey)):[];
  for(const row of rows)if(row)remember(row.key,row.blob);
  return parents.flatMap(tile=>{const blob=memory.get(tileKey(tile));return blob?[{tile,blob}]:[];});
}

export async function getTile(
  t: Tile,
  pinned = false,
  needed: () => boolean = () => true,
): Promise<Blob | undefined> {
  const key = tileKey(t);
  const cached = await cachedTile(t);
  if (cached) {
    if (pinned)
      await mapDB.tiles.put({
        ...t,
        key,
        blob: cached,
        used: Date.now(),
        pinned: 1,
      });
    return cached;
  }
  if (offlineMap()) return;
  if ((failed.get(key) || 0) > Date.now() - 20000) return;
  const existing = pending.get(key);
  if (existing) {
    existing.consumers.add(needed);
    const blob = await existing.promise;
    if (blob && pinned) await mapDB.tiles.update(key, { pinned: 1 });
    return blob;
  }
  const consumers = new Set([needed]);
  const task = slot(async () => {
    // Après un zoom, une nouvelle tuile peut encore attendre la même image.
    if (offlineMap() || ![...consumers].some((isNeeded) => isNeeded())) return;
    try {
      const r = await fetch(tileURL(t), { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("Carte indisponible");
      const blob = await r.blob();
      // Refuser les erreurs XML/HTML même si le serveur répond 200.
      const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (!(
        (bytes[0] === 255 && bytes[1] === 216) ||
        (bytes[0] === 137 && bytes[1] === 80)
      ))
        throw new Error("Image invalide");
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
      remember(key, blob);
      const save = mapDB.tiles.put({ ...t, key, blob, used: Date.now(), pinned: pinned ? 1 : 0 })
        .then(() => { if (++writes % 25 === 0) void trimCache().catch(() => {}); });
      // Afficher sans attendre l’écriture disque ; un téléchargement volontaire attend sa sauvegarde.
      if (pinned) await save;
      else void save.catch(() => {});
      return blob;
    } catch {
      failed.set(key, Date.now());
      return;
    }
  });
  pending.set(key, { promise: task, consumers });
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
async function trimCache() {
  // Les zones téléchargées volontairement sont protégées de cette rotation.
  const rows = await mapDB.tiles.where("pinned").equals(0).sortBy("used");
  let bytes = rows.reduce((sum, r) => sum + r.blob.size, 0);
  const remove: string[] = [];
  for (const r of rows) {
    if (bytes <= MAP_CACHE_MAX_BYTES && rows.length - remove.length <= MAP_CACHE_MAX_TILES)
      break;
    remove.push(r.key);
    bytes -= r.blob.size;
  }
  await mapDB.tiles.bulkDelete(remove);
  remove.forEach((key) => { memory.delete(key); touched.delete(key); });
}
export async function clearMapCache() {
  // Appelé lorsque les téléchargements sont terminés par le panneau de carte.
  await Promise.allSettled([...pending.values()].map((p) => p.promise));
  await mapDB.tiles.clear();
  memory.clear();
  for(const value of decoded.values())value.image.close();
  decoded.clear();
  touched.clear();
  failed.clear();
  window.dispatchEvent(new Event("map-mode"));
}
export function retryMissingTiles(){failed.clear();}
export async function paintTile(
  canvas: HTMLCanvasElement,
  t: Tile,
  ready?: () => void,
  needed: () => boolean = () => true,
) {
  const ctx = canvas.getContext("2d")!;
  const exact = await cachedTile(t);
  const draw = async (blob: Blob, key: string, ...coords: number[]) => {
    if(!needed())return;
    const img = await tileBitmap(key,blob);
    if(!needed())return;
    if (coords.length)
      ctx.drawImage(
        img,
        coords[0],
        coords[1],
        coords[2],
        coords[3],
        coords[4],
        coords[5],
        coords[6],
        coords[7],
      );
    else ctx.drawImage(img, 0, 0, 256, 256);
  };
  if (exact) {
    canvas.dataset.preview="false";
    await draw(exact,tileKey(t));
    return true;
  }
  // Lire tous les parents en un accès IndexedDB ; conserver le fond pendant le zoom.
  let fallback = false;
  const parents=await cachedParents(t);
  const parent=parents[0];
  if(parent && needed()) {
    const factor=2**(t.z-parent.tile.z);
    await draw(parent.blob,tileKey(parent.tile),((t.x%factor)*256)/factor,((t.y%factor)*256)/factor,256/factor,256/factor,0,0,256,256);
    fallback=true;
  }
  if (!fallback && needed()) {
    // Six niveaux au lieu de deux ; les fragments à plusieurs niveaux se complètent.
    const levels=Array.from({length:Math.min(6,19-t.z)},(_,i)=>i+1);
    const groups=await Promise.all(levels.map(async level=>{
      const factor=2**level,z=t.z+level,minX=t.x*factor,minY=t.y*factor;
      const rows=await mapDB.tiles.where("[style+z+x+y]")
        .between([t.style,z,minX,0],[t.style,z,minX+factor-1,2**z-1],true,true)
        .filter(row=>row.y>=minY && row.y<minY+factor).toArray();
      return {factor,rows};
    }));
    // Les niveaux plus fins remplissent aussi les trous d’un premier niveau partiel.
    for(const {factor,rows} of groups)for(const child of rows){
      if(!needed())return fallback;
      remember(child.key,child.blob);
      await draw(child.blob,child.key,0,0,256,256,(child.x-t.x*factor)*256/factor,(child.y-t.y*factor)*256/factor,256/factor,256/factor);
      fallback=true;
    }
  }
  if (fallback) {canvas.dataset.preview="true";ready?.();}
  const blob = await getTile(t, false, needed);
  if (blob) {
    canvas.dataset.preview="false";
    await draw(blob,tileKey(t));
    return true;
  }
  return fallback;
}
