import {canonicalCatalogVersion} from "./canonical-version";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const f=vi.hoisted(()=>{
 const places=new Map<string,any>(),removed=new Map<string,any>(),meta=new Map<string,any>();
 return {places,removed,meta,offline:false,native:false,fetch:vi.fn(),db:{places:{bulkGet:async(ids:string[])=>ids.map(id=>places.get(id)),bulkAdd:async(rows:any[])=>rows.forEach(p=>places.set(p.id,p))},removed:{bulkGet:async(ids:string[])=>ids.map(id=>removed.get(id))},meta:{get:async(k:string)=>meta.get(k),put:async(row:any)=>meta.set(row.key,row)},transaction:async(...args:any[])=>args.at(-1)()}};
});
vi.mock("./canonical-store",()=>({canonicalizeImported:vi.fn(),canonicalPlacesInRadius:vi.fn(async(rows:any[])=>rows)}));
vi.mock("./store",()=>({db:f.db,notify:vi.fn()}));
vi.mock("@capacitor/core",()=>({Capacitor:{isNativePlatform:()=>f.native}}));
vi.mock("./catalog-assets",()=>({fetchCatalogAsset:async(path:string)=>{const response=await f.fetch(path);return {...response,json:async()=>{const data=await response.json();return Array.isArray(data)?data.map(p=>({lat:46,lon:5,...p})):data;}}}}));
vi.mock("./map-cache",()=>({offlineMap:()=>f.offline}));
beforeEach(()=>{vi.resetModules();f.places.clear();f.removed.clear();f.meta.clear();f.offline=false;f.native=false;f.fetch.mockReset();vi.stubGlobal("fetch",f.fetch);});
afterEach(()=>vi.unstubAllGlobals());
const area={west:4,south:45,east:6,north:47};
it("charge toutes les tuiles intersectant le rectangle, une seule fois",async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'v1',tiles:[{file:'west.json',bounds:[4.7,45.7,4.95,45.95],count:1},{file:'east.json',bounds:[5.05,46.05,5.3,46.3],count:1},{file:'outside.json',bounds:[7,48,8,49],count:1}]}:[{id:url,name:'Import'}]}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area);await loadFranceBounds(area);
 expect(f.fetch.mock.calls.map(c=>c[0]).sort()).toEqual(['/france/east.json','/france/index.json','/france/west.json']);expect(f.places.size).toBe(2);
});
it("préserve corrections locales et suppressions au téléchargement",async()=>{
 f.places.set('edited',{id:'edited',name:'Correction'});f.removed.set('deleted',{id:'deleted'});
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'v1',tiles:[{file:'test.json',bounds:[4,45,6,47],count:3}]}:[{id:'edited',name:'Ancien nom'},{id:'deleted'},{id:'new'}]}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area);
 expect(f.places.get('edited').name).toBe('Correction');expect(f.places.has('deleted')).toBe(false);expect(f.places.has('new')).toBe(true);
});
it("ne déclare pas une zone téléchargée si les lieux sont indisponibles",async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:url.endsWith('index.json'),json:async()=>({version:'v1',tiles:[{file:'test.json',bounds:[4,45,6,47],count:1}]})}));
 const {loadFranceBounds}=await import('./france-catalog');await expect(loadFranceBounds(area)).rejects.toThrow('interrompu');expect(f.meta.size).toBe(0);
});
it("ne contacte pas le réseau quand le mode hors connexion est choisi",async()=>{
 f.offline=true;const {loadFranceBounds}=await import('./france-catalog');await expect(loadFranceBounds(area)).rejects.toThrow('Reconnectez');expect(f.fetch).not.toHaveBeenCalled();
});
it("reprend une zone dont la préparation des fiches a échoué",async()=>{
 const {canonicalizeImported}=await import('./canonical-store');
 vi.mocked(canonicalizeImported).mockRejectedValueOnce(new Error('Migration interrompue'));
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'v1',tiles:[{file:'test.json',bounds:[4,45,6,47],count:1}]}:[{id:'new'}]}));
 const {loadFranceBounds}=await import('./france-catalog');
 await expect(loadFranceBounds(area)).rejects.toThrow('Migration interrompue');expect(f.meta.size).toBe(0);
 await loadFranceBounds(area);expect(f.meta.size).toBe(1);expect(f.places.size).toBe(1);
});

it("ouvre une zone Android jamais consultée même hors connexion",async()=>{
 f.native=true;f.offline=true;f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'v2',tiles:[{file:'offline.json',bounds:[4,45,6,47],count:1}]}:[{id:'offline-place'}]}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area);expect(f.places.has('offline-place')).toBe(true);
});
it("une nouvelle version globale ne relit pas les fichiers inchangés",async()=>{
 f.meta.set(`france-scope-v3:${canonicalCatalogVersion}:same.json:abc`,{key:`france-scope-v3:${canonicalCatalogVersion}:same.json:abc`,value:true});
 f.fetch.mockImplementation(async()=>({ok:true,json:async()=>({version:'v3',tiles:[{file:'same.json',hash:'abc',bounds:[4,45,6,47],count:1}]})}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area);expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("une empreinte modifiée n’adopte pas une ancienne tuile",async()=>{
 f.meta.set('france-v1:changed.json',{value:true});f.meta.set('france-v1-changed.json',{value:true});
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'v2',hashBaselineVersion:'v1',tiles:[{file:'changed.json',hash:'new',baselineHash:'old',bounds:[4,45,6,47],count:1}]}:[{id:'new-place'}]}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area);expect(f.fetch).toHaveBeenCalledTimes(2);expect(f.places.has('new-place')).toBe(true);
});

const priorityTiles=[
 {file:'far.json',bounds:[5.5,46,5.6,46.1],count:1},
 {file:'middle.json',bounds:[5.2,46,5.3,46.1],count:1},
 {file:'near.json',bounds:[4.99,45.99,5.01,46.01],count:1},
];
function priorities(){f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'priority',tiles:priorityTiles}:[{id:url}]}));}
it('importe les zones immédiates avant les zones éloignées, quel que soit l’ordre du catalogue',async()=>{
 priorities();const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area,()=>false,{lat:46,lon:5});
 expect(f.fetch.mock.calls.map(c=>c[0])).toEqual(['/france/index.json','/france/near.json','/france/middle.json','/france/far.json']);
});
it('utilise la position choisie plutôt que le centre géométrique du rayon',async()=>{
 priorities();const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area,()=>false,{lat:46.05,lon:5.55});
 expect(f.fetch.mock.calls[1][0]).toBe('/france/far.json');
});
it('arrête les zones suivantes quand la position change et conserve la zone déjà importée',async()=>{
 priorities();let cancelled=false;const {canonicalizeImported}=await import('./canonical-store');
 vi.mocked(canonicalizeImported).mockImplementationOnce(async()=>{cancelled=true;});
 const {loadFranceBounds}=await import('./france-catalog');await expect(loadFranceBounds(area,()=>cancelled,{lat:46,lon:5})).rejects.toThrow('interrompu');
 expect(f.fetch.mock.calls.map(c=>c[0])).toEqual(['/france/index.json','/france/near.json']);expect(f.places.size).toBe(1);expect(f.meta.size).toBe(1);
});
it('mutualise les chargements simultanés et ne rafraîchit pas une zone inchangée',async()=>{
 priorities();const {loadFranceBounds}=await import('./france-catalog');
 await Promise.all([loadFranceBounds(area),loadFranceBounds(area)]);
 expect(f.fetch).toHaveBeenCalledTimes(4);
 const {notify}=await import('./store');vi.mocked(notify).mockClear();
 await loadFranceBounds(area);expect(f.fetch).toHaveBeenCalledTimes(4);expect(notify).not.toHaveBeenCalled();
});

it('n’importe aucun lieu au-delà du rayon réglé, même dans un fichier qui déborde',async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'radius',tiles:[{file:'wide.json',bounds:[4,45,6,47],count:3}]}:[{id:'immediate',lat:46,lon:5},{id:'20km',lat:46.18,lon:5},{id:'60km',lat:46.54,lon:5}]}));
 const {loadFranceBounds}=await import('./france-catalog');
 await loadFranceBounds(area,()=>false,{lat:46,lon:5},10_000);
 expect([...f.places.keys()]).toEqual(['immediate']);
 await loadFranceBounds(area,()=>false,{lat:46,lon:5},100_000);
 expect([...f.places.keys()]).toEqual(['immediate','20km']);expect(f.places.has('60km')).toBe(false);
 const calls=f.fetch.mock.calls.length;await loadFranceBounds(area,()=>false,{lat:46,lon:5},50_000);expect(f.fetch).toHaveBeenCalledTimes(calls);
});
it('ignore les zones hors du cercle même si elles touchent son rectangle englobant',async()=>{
 f.fetch.mockResolvedValue({ok:true,json:async()=>({version:'radius',tiles:[{file:'corner.json',bounds:[5.5,46.4,5.6,46.5],count:1}]})});
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area,()=>false,{lat:46,lon:5},50_000);
 expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('termine aussi le rayon large demandé pendant un import partiel plus petit',async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'radius',tiles:[{file:'wide.json',bounds:[4,45,6,47],count:2}]}:[{id:'near',lat:46,lon:5},{id:'farther',lat:46.18,lon:5}]}));
 const {loadFranceBounds}=await import('./france-catalog');
 await Promise.all([loadFranceBounds(area,()=>false,{lat:46,lon:5},1000),loadFranceBounds(area,()=>false,{lat:46,lon:5},30_000)]);
 expect(f.places.has('farther')).toBe(true);expect(f.fetch).toHaveBeenCalledTimes(2);
});

it('charge les lieux autour de la nouvelle localisation malgré un ancien import partiel',async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'moving',tiles:[{file:'wide.json',bounds:[4,45,6,47],count:2}]}:[{id:'old-area',lat:46,lon:5},{id:'new-area',lat:46.25,lon:5}]}));
 const {loadFranceBounds}=await import('./france-catalog');
 await loadFranceBounds(area,()=>false,{lat:46,lon:5},5000);expect(f.places.has('new-area')).toBe(false);
 await loadFranceBounds(area,()=>false,{lat:46.25,lon:5},5000);expect(f.places.has('new-area')).toBe(true);
 const calls=f.fetch.mock.calls.length;await loadFranceBounds(area,()=>false,{lat:46,lon:5},5000);expect(f.fetch).toHaveBeenCalledTimes(calls);
});

it('préserve tous les lieux et champs du catalogue initial dans les nouvelles zones locales',async()=>{
 const {readFileSync}=await import('node:fs');const read=(file:string)=>JSON.parse(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'));
 const expected=new Map<string,any>();for(const file of ['seed.json','catalog-017.json','catalog-health-015.json','catalog-toilets-017.json','catalog-family-017.json'])for(const place of read(file))if(!expected.has(place.id))expected.set(place.id,place);
 const tiles=read('france/index.json').tiles.filter((t:any)=>t.file.startsWith('local050_'));
 const actual=new Map<string,any>();for(const tile of tiles){const rows=read('france/'+tile.file);expect(rows.length).toBe(tile.count);for(const place of rows){expect(actual.has(place.id)).toBe(false);actual.set(place.id,place);}}
 expect(actual).toEqual(expected);
});

it('ne marque pas un fichier comme complet lorsqu’une fiche fusionnée a été exclue du rayon',async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'edge',tiles:[{file:'one.json',bounds:[4,45,6,47],count:1}]}:[{id:'near'}]}));
 const {canonicalPlacesInRadius}=await import('./canonical-store');vi.mocked(canonicalPlacesInRadius).mockResolvedValueOnce([]);
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area,()=>false,{lat:46,lon:5},1000);
 expect(f.places.size).toBe(0);expect([...f.meta.values()][0].value).not.toBe(true);
 await loadFranceBounds(area,()=>false,{lat:46.01,lon:5},2000);expect(f.places.has('near')).toBe(true);
});

it('importe les lieux d’un même fichier par distance croissante en petits lots',async()=>{
 const rows=Array.from({length:450},(_,i)=>({id:String(i),lat:46+(449-i)*.00001,lon:5}));
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'batches',tiles:[{file:'dense.json',bounds:[4,45,6,47],count:450}]}:rows}));
 const {canonicalizeImported}=await import('./canonical-store');vi.mocked(canonicalizeImported).mockClear();
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area,()=>false,{lat:46,lon:5},1000);
 const batches=vi.mocked(canonicalizeImported).mock.calls.map(c=>c[0]!);
 expect(batches.map(b=>b.length)).toEqual([200,200,50]);expect(batches.flat()).toEqual(rows.map(p=>p.id).reverse());
});
it('élargit progressivement le rayon et réutilise les fichiers décodés',async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'steps',tiles:[{file:'all.json',bounds:[4,45,6,47],count:3}]}:[{id:'far',lat:46.18,lon:5},{id:'middle',lat:46.01,lon:5},{id:'near',lat:46,lon:5}]}));
 const {loadFranceProgressively,progressiveRadii}=await import('./france-catalog');const snapshots:string[][]=[];
 await loadFranceProgressively(area,()=>false,{lat:46,lon:5},30000,()=>snapshots.push([...f.places.keys()]));
 expect(progressiveRadii(30000)).toEqual([250,1000,2000,5000,10000,20000,30000]);expect(snapshots[0]).toEqual(['near']);expect([...f.places.keys()]).toEqual(['near','middle','far']);expect(f.fetch).toHaveBeenCalledTimes(2);
});

it('fait passer un lieu d’un deuxième fichier avant les lieux plus éloignés du premier',async()=>{
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'cross-tiles',tiles:[{file:'first.json',bounds:[4.99,45.99,5.03,46.03],count:2},{file:'second.json',bounds:[5,46.001,5.03,46.03],count:1}]}:url.includes('first')?[{id:'nearest',lat:46,lon:5},{id:'far',lat:46.02,lon:5}]:[{id:'middle',lat:46.005,lon:5}]}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area,()=>false,{lat:46,lon:5},5000);
 expect([...f.places.keys()]).toEqual(['nearest','middle','far']);
});
it('réapplique les fusions aux anciens rayons sans migrer tout le cache national',async()=>{
 f.meta.set('france-scope-v2:test.json:abc',{value:true});f.meta.set('france-v1-test.json',{value:true});
 f.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.endsWith('index.json')?{version:'v2',hashBaselineVersion:'v1',tiles:[{file:'test.json',hash:'abc',baselineHash:'abc',bounds:[4,45,6,47],count:1}]}:[{id:'new-place'}]}));
 const {loadFranceBounds}=await import('./france-catalog');await loadFranceBounds(area);
 expect(f.places.has('new-place')).toBe(true);expect(f.fetch).toHaveBeenCalledTimes(2);
});
