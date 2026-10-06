import { afterEach, expect, it, vi } from "vitest";
const cache = vi.hoisted(()=>new Map<string, any>());
vi.mock("dexie", () => ({
 default: class {
  makeTiles(){return {
   get: async (key:string)=>cache.get(key),
   put: async (row:any)=>cache.set(row.key,row),
   update: async()=>undefined,
   bulkGet: async(keys:string[])=>keys.map(key=>cache.get(key)),
   where: ()=>({between:(lo:any[],hi:any[])=>({filter:(predicate:(row:any)=>boolean)=>({toArray:async()=>[...cache.values()].filter(row=>row.style===lo[0] && row.z===lo[1] && row.x>=lo[2] && row.x<=hi[2] && predicate(row))})})}),
  };}
  tiles = this.makeTiles();
  version(){return {stores:()=>{this.tiles=this.makeTiles();}};}
 }
}));
afterEach(() => {
  cache.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("garde une requête en attente si le nouveau niveau de zoom en a encore besoin", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("createImageBitmap", async () => ({ close() {} }));
  const releases: (() => void)[] = [];
  const fetchMock = vi.fn(
    () =>
      new Promise((resolve) =>
        releases.push(() =>
          resolve({
            ok: true,
            blob: async () => new Blob([new Uint8Array([255, 216, 255, 217])]),
          }),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { getTile } = await import("./map-cache");
  // Occuper les quatre connexions, puis remplacer une tuile avant son chargement.
  const active = Array.from({ length: 4 }, (_, x) =>
    getTile({ style: "aerial", z: 10, x, y: 0 }),
  );
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  let oldVisible = true;
  const queued = getTile(
    { style: "aerial", z: 10, x: 4, y: 0 },
    false,
    () => oldVisible,
  );
  await Promise.resolve();
  await Promise.resolve();
  oldVisible = false;
  const replacement = getTile(
    { style: "aerial", z: 10, x: 4, y: 0 },
    false,
    () => true,
  );
  await Promise.resolve();
  await Promise.resolve();
  releases[0]();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  releases.slice(1).forEach((release) => release());
  await Promise.all(active);
  expect(await queued).toBeInstanceOf(Blob);
  expect(await replacement).toBeInstanceOf(Blob);
});

it("compose hors ligne des fragments à cinq niveaux et des niveaux mélangés sans redécodage",async()=>{
 vi.stubGlobal("localStorage",{getItem:()=>"true"});vi.stubGlobal("navigator",{onLine:false});
 const bitmap=vi.fn(async(blob:Blob)=>({blob,close(){}}));vi.stubGlobal("createImageBitmap",bitmap);
 const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 const {paintTile,tileKey}=await import("./map-cache");
 const coarse={style:"plan" as const,z:11,x:20,y:20};
 const fine={style:"plan" as const,z:15,x:336,y:320};
 for(const tile of [coarse,fine])cache.set(tileKey(tile),{...tile,key:tileKey(tile),blob:new Blob([tileKey(tile)])});
 const drawImage=vi.fn(),canvas={dataset:{},getContext:()=>({drawImage})} as unknown as HTMLCanvasElement;
 const ready=vi.fn(()=>expect(drawImage).toHaveBeenCalledTimes(2));
 const target={style:"plan" as const,z:10,x:10,y:10};
 expect(await paintTile(canvas,target,ready)).toBe(true);
 expect(drawImage.mock.calls[0].slice(5)).toEqual([0,0,128,128]);
 expect(drawImage.mock.calls[1].slice(5)).toEqual([128,0,8,8]);
 expect(ready).toHaveBeenCalledOnce();expect(fetchMock).not.toHaveBeenCalled();
 await paintTile(canvas,target);expect(bitmap).toHaveBeenCalledTimes(2);
});
it("utilise une tuile parent à huit niveaux et ne dessine pas une tuile abandonnée",async()=>{
 vi.stubGlobal("localStorage",{getItem:()=>"true"});vi.stubGlobal("navigator",{onLine:false});
 vi.stubGlobal("createImageBitmap",async()=>({close(){}}));
 const {paintTile,tileKey}=await import("./map-cache");
 const parent={style:"plan" as const,z:2,x:1,y:1};cache.set(tileKey(parent),{...parent,key:tileKey(parent),blob:new Blob(["parent"])});
 const drawImage=vi.fn(),canvas={dataset:{},getContext:()=>({drawImage})} as unknown as HTMLCanvasElement;
 expect(await paintTile(canvas,{style:"plan",z:10,x:256,y:256})).toBe(true);
 expect(drawImage.mock.calls[0].slice(1)).toEqual([0,0,1,1,0,0,256,256]);
 drawImage.mockClear();await paintTile(canvas,{style:"plan",z:10,x:256,y:256},undefined,()=>false);expect(drawImage).not.toHaveBeenCalled();
});
