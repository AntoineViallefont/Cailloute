import {beforeEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>{
 const table=()=>{const rows=new Map<string,any>();return {rows,get:async(id:string)=>rows.get(id),put:async(row:any)=>rows.set(row.id??row.key,row),bulkGet:async(ids:string[])=>ids.map(id=>rows.get(id))};};
 return {db:{meta:table(),places:table(),removed:table(),catalogGroups:table(),sourceRevisions:table()},offline:false,admin:false,fetch:vi.fn(),photos:vi.fn(),canonical:vi.fn(),apply:vi.fn(),notify:vi.fn()};
});
vi.mock('./store',()=>({db:f.db,notify:f.notify}));
vi.mock('./free-sync',()=>({refreshFreePreviews:f.photos,applyFreeChanges:f.apply}));
vi.mock('./free-cloud',()=>({fetchFreePlace:f.fetch,freeCollaborationEnabled:true,getFreeSession:()=>({isAdmin:f.admin})}));
vi.mock('./map-cache',()=>({offlineMap:()=>f.offline}));
vi.mock('./canonical-store',()=>({prepareCanonicalCatalog:async()=>{},canonicalizeImported:f.canonical}));
vi.mock('./detail-sources',()=>({detailIdentity:()=> 'place',matchingPhotoPlace:()=>null}));
import {loadOpenedDetail} from './open-detail';
beforeEach(()=>{
 for(const t of Object.values(f.db))t.rows.clear();
 f.offline=false;f.admin=false;f.fetch.mockReset().mockResolvedValue(null);f.photos.mockReset().mockResolvedValue(undefined);f.canonical.mockReset();f.apply.mockReset();
 f.db.places.rows.set('p',{id:'p',name:'Parc',category:'playground',lat:45,lon:5});
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[]})));
});
it('ne relit ni Firebase ni les photos lors de dix réouvertures dans la journée',async()=>{
 await loadOpenedDetail('p');for(let n=0;n<10;n++)await loadOpenedDetail('p');
 expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.photos).toHaveBeenCalledTimes(1);expect(f.canonical).toHaveBeenCalledTimes(1);
});
it('mutualise deux ouvertures simultanées et permet une réparation explicite',async()=>{
 await Promise.all([loadOpenedDetail('p'),loadOpenedDetail('p')]);expect(f.fetch).toHaveBeenCalledTimes(1);
 await loadOpenedDetail('p',true);expect(f.fetch).toHaveBeenCalledTimes(2);
});
it('réactualise après 24 heures et ne masque pas une panne dans le cache',async()=>{
 await f.db.meta.put({key:'detail-loaded:p',value:Date.now()-86_400_001});
 f.fetch.mockRejectedValueOnce(Error('Réseau indisponible'));
 await expect(loadOpenedDetail('p')).rejects.toThrow('Réseau');
 await loadOpenedDetail('p');expect(f.fetch).toHaveBeenCalledTimes(2);
});
it('reste local hors connexion, y compris pour une relance explicite',async()=>{
 f.offline=true;await loadOpenedDetail('p',true);expect(f.fetch).not.toHaveBeenCalled();expect(f.canonical).not.toHaveBeenCalled();
});
it('garde une actualisation plus courte pour l’administrateur',async()=>{
 f.admin=true;await f.db.meta.put({key:'detail-loaded:p',value:Date.now()-300_001});
 await loadOpenedDetail('p');await loadOpenedDetail('p');expect(f.fetch).toHaveBeenCalledTimes(1);
});
