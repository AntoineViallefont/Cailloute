import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({native:false,offline:false}));
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>state.native}}));
vi.mock('./map-cache',()=>({offlineMap:()=>state.offline}));
import {catalogAssetURL,fetchCatalogAsset} from './catalog-assets';
let rows:Map<string,Response>,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{state.native=false;state.offline=false;rows=new Map();fetcher=vi.fn(async(url:string)=>new Response(url.startsWith('/route-assets.json')?'{}':'{"routes":[]}',{status:200}));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('caches',{open:async()=>({match:async(url:string)=>rows.get(url)?.clone(),put:async(url:string,value:Response)=>{rows.set(url,value);}})});});
afterEach(()=>vi.unstubAllGlobals());
it('le site garde ses ressources relatives ; Android utilise les lieux embarqués',()=>{expect(catalogAssetURL('/france/index.json')).toBe('/france/index.json');state.native=true;expect(catalogAssetURL('/france/index.json')).toBe('/france/index.json');});
it('conserve un tracé téléchargé et le relit hors connexion sans nouvel appel réseau',async()=>{state.native=true;await fetchCatalogAsset('/transit-france/route.json');state.offline=true;expect(await(await fetchCatalogAsset('/transit-france/route.json')).json()).toEqual({routes:[]});expect(fetcher).toHaveBeenCalledTimes(2);});
it('un tracé absent hors connexion ne déclenche pas de téléchargement',async()=>{state.native=true;state.offline=true;await expect(fetchCatalogAsset('/transit-france/absent.json')).rejects.toThrow('non enregistré');expect(fetcher.mock.calls.every(c=>String(c[0]).startsWith('/route-assets.json'))).toBe(true);});
it('une réponse en erreur ne remplace pas le cache',async()=>{state.native=true;fetcher.mockResolvedValue(new Response('indisponible',{status:503}));expect((await fetchCatalogAsset('/transit-france/route.json')).status).toBe(503);expect(rows.size).toBe(0);});

it('les lieux Android hors connexion sont lus localement',async()=>{state.native=true;state.offline=true;await fetchCatalogAsset('/france/zone.json?v=hash');expect(fetcher).toHaveBeenCalledWith('/france/zone.json?v=hash');});
it('la fusion Android est embarquée et reste disponible dans une nouvelle zone hors connexion',async()=>{
 state.native=true;state.offline=true;const path='/canonical/183_19.json.gz?v=version';
 expect(catalogAssetURL(path)).toBe('/canonical/183_19.json.bin?v=version');
 await fetchCatalogAsset(path);expect(fetcher).toHaveBeenCalledWith('/canonical/183_19.json.bin?v=version');
});
it('mutualise les téléchargements simultanés tout en fournissant des réponses lisibles séparément',async()=>{
 state.native=false;const path='/canonical/concurrent.json?v=once';let release:()=>void=()=>{};
 fetcher.mockImplementation(async()=>{await new Promise<void>(r=>release=r);return new Response('{"ok":true}');});
 const a=fetchCatalogAsset(path),b=fetchCatalogAsset(path);
 await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));release();
 const results=await Promise.all([a,b]);expect(await results[0].json()).toEqual({ok:true});expect(await results[1].json()).toEqual({ok:true});
});
