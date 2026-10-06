import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>{
 const table=()=>{const rows=new Map<string,any>();return {rows,get:async(id:string)=>rows.get(id),bulkGet:async(ids:string[])=>ids.map(id=>rows.get(id)),put:async(p:any)=>rows.set(p.id??p.key,p),bulkPut:async(ps:any[])=>ps.forEach(p=>rows.set(p.id??p.key,p))};};
 return {read:vi.fn(),db:{catalogGroups:table(),catalogSources:table(),places:table(),meta:table(),transaction:async(...a:any[])=>a.at(-1)()}};
});
vi.mock('./store',()=>({db:f.db}));vi.mock('./catalog-assets',()=>({fetchCatalogAsset:(path:string)=>f.read(path)}));
beforeEach(()=>{vi.resetModules();for(const t of Object.values(f.db))if(typeof t!=='function')t.rows.clear();f.read.mockReset();vi.stubGlobal('navigator',{onLine:true});});
afterEach(()=>vi.unstubAllGlobals());
it('installe seulement la fiche proche puis prépare les suivantes sans relire la grande zone',async()=>{
 const {canonicalCatalogVersion:version}=await import('./canonical-version');
 const a={id:'a',lat:45.18,lon:5.72,version:1},b={id:'b',lat:45.2,lon:5.73,version:1};
 const groups=[a,b].map(p=>({id:p.id,place:{...p,catalog_version:version},originals:[p]}));
 const tile={version,groups};f.read.mockResolvedValue(new Response(JSON.stringify(tile)));
 await f.db.meta.put({key:`canonical-tiles:${version}`,value:[{file:'grenoble.json.gz',bounds:[5,45,6,46],count:2}]});
 const {canonicalPlacesInRadius}=await import('./canonical-store');
 await canonicalPlacesInRadius([a] as any,a,1000);
 expect([...f.db.catalogGroups.rows.keys()]).toEqual(['a']);expect(await f.db.meta.get(`canonical-tile:${version}:grenoble.json.gz`)).toBeUndefined();
 await canonicalPlacesInRadius([b] as any,b,1000);
 expect([...f.db.catalogGroups.rows.keys()]).toEqual(['a','b']);expect(f.read).toHaveBeenCalledTimes(1);
});
