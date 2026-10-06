import {beforeEach,it,expect,vi} from 'vitest';
import type {Place} from './types';
const f=vi.hoisted(()=>{
 const table=()=>{const rows=new Map<string,any>();return {rows,get:async(id:string)=>rows.get(id),toArray:async()=>[...rows.values()],bulkGet:async(ids:string[])=>ids.map(id=>rows.get(id)),put:async(p:any)=>rows.set(p.id??p.key,structuredClone(p)),bulkPut:async(ps:any[])=>ps.forEach(p=>rows.set(p.id??p.key,structuredClone(p))),bulkDelete:async(ids:string[])=>ids.forEach(id=>rows.delete(id)),toCollection:()=>({primaryKeys:async()=>[...rows.keys()]})};};
 return {db:{places:table(),personal:table(),details:table(),removed:table(),catalogGroups:table(),catalogSources:table(),sourceRevisions:table(),meta:table(),transaction:async(...a:any[])=>a.at(-1)()}};
});
vi.mock('./store',()=>({db:f.db}));
import {canonicalizeImported,canonicalPlacesInRadius} from './canonical-store';
import {canonicalCatalogVersion} from './canonical-version';
const place=(id:string,description:string):Place=>({id,name:'Aire de jeux',category:'playground',lat:45,lon:5,description,version:1} as Place);
beforeEach(()=>{for(const t of Object.values(f.db))if(typeof t!=='function')t.rows.clear();});
it('installe une fiche unique, conserve photos et corrections, et ne recommence pas au lancement suivant',async()=>{
 const a=place('a','Balançoire'),b=place('b','Toboggan');
 const group={id:'a',place:{...a,description:'Balançoire\n\nToboggan',catalog_sources:['a','b'],catalog_version:canonicalCatalogVersion},originals:[a,b]};
 await f.db.catalogGroups.put(group);
 for(const p of [a,b])await f.db.catalogSources.put({id:p.id,canonicalId:'a',place:p});
 await f.db.places.bulkPut([a,{...b,wheelchair:true},place('c_nouveau','Contribution indépendante')]);
 await f.db.details.put({...b,photos:[{id:'photo-b'}],reviews:[]});
 await canonicalizeImported();
 const root=await f.db.places.get('a');
 expect(root.description).toBe('Balançoire\n\nToboggan');expect(root.wheelchair).toBe(true);
 expect((await f.db.places.get('b')).redirect).toBe('a');
 expect((await f.db.details.get('a')).photos[0]).toMatchObject({id:'photo-b',place_id:'b'});
 expect((await f.db.places.get('c_nouveau')).redirect).toBeUndefined();
 await f.db.places.put({...root,name:'Correction après migration'});
 await canonicalizeImported();await canonicalizeImported(['a','b']);
 expect((await f.db.places.get('a')).name).toBe('Correction après migration');
 expect(f.db.sourceRevisions.rows.size).toBe(2);
});

it('respecte le rayon selon la position du lieu fusionné, et non d’un seul de ses anciens doublons',async()=>{
 const a=place('root',''),b=place('source','');const group={id:a.id,place:{...a,lat:45.02,catalog_version:canonicalCatalogVersion},originals:[a,b]};
 await f.db.meta.put({key:'canonical-catalog',value:canonicalCatalogVersion});await f.db.catalogGroups.put(group);
 await f.db.catalogSources.put({id:b.id,canonicalId:a.id,place:b});
 expect(await canonicalPlacesInRadius([b],{lat:45,lon:5},1000)).toEqual([]);
 await f.db.places.put({...a,catalog_version:canonicalCatalogVersion});
 expect(await canonicalPlacesInRadius([b],{lat:45,lon:5},1000)).toEqual([b]);
});

it('garde une fiche explicitement éditée sans fusion ni changement de champs',async()=>{
 const a=place('a','Import'),b={...place('b','Texte personnel très long'),name:'Mon nom',version:2};
 await f.db.catalogGroups.put({id:'a',place:{...a,catalog_version:canonicalCatalogVersion},originals:[a,place('b','Import')]});
 for(const p of [a,b])await f.db.catalogSources.put({id:p.id,canonicalId:'a',place:p});
 await f.db.places.bulkPut([a,b]);await canonicalizeImported();
 expect(await f.db.places.get('b')).toEqual(b);expect((await f.db.places.get('a')).catalog_version).toBeUndefined();
});

it('conserve une correction personnelle même si le catalogue source est encore en version initiale',async()=>{
 const a=place('a','Import'),b=place('b','Import');
 await f.db.catalogGroups.put({id:'a',place:{...a,catalog_version:canonicalCatalogVersion},originals:[a,b]});
 for(const p of [a,b])await f.db.catalogSources.put({id:p.id,canonicalId:'a',place:p});
 await f.db.places.bulkPut([a,b]);await f.db.personal.put({id:'b',patch:{name:'Mon cinéma'},informationEditedAt:'2026-10-05'});
 await canonicalizeImported();expect(await f.db.places.get('b')).toEqual(b);expect(await f.db.personal.get('b')).toMatchObject({patch:{name:'Mon cinéma'}});
});
