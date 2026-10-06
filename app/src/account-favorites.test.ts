import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>{
 function table(){const rows=new Map<string,any>();return {rows,get:async(k:string)=>structuredClone(rows.get(k)),put:async(v:any)=>{rows.set(v.key??v.id,structuredClone(v));},toArray:async()=>[...rows.values()].map(v=>structuredClone(v)),delete:async(id:string)=>{rows.delete(id)},clear:async()=>rows.clear(),bulkPut:async(values:any[])=>{values.forEach(v=>rows.set(v.id,structuredClone(v)))}};}
 const db={meta:table(),favorites:table(),transaction:async(...args:any[])=>args.at(-1)()};return{db,uid:'alice' as string|undefined,load:vi.fn(),save:vi.fn()};
});
vi.mock('./map-cache',()=>({offlineMap:()=>!navigator.onLine}));
vi.mock('./store',()=>({db:f.db}));
vi.mock('./free-cloud',()=>({freeReadsLeft:async()=>{const {automaticReadsLeft}=await import('./cloud-budget');return automaticReadsLeft();},accountDeletionInProgress:()=>false,freeCollaborationEnabled:true,getFreeSession:()=>f.uid?{uid:f.uid}:null,loadFreeFavoriteChanges:async()=>({changes:(await f.load()).map((id:string)=>({id,value:true})),cursor:{time:1,id:"last"},hasMore:false}),setFreeFavorite:f.save}));
import{syncAccountFavorites,waitForFavoriteSync}from'./account-favorites';
beforeEach(async()=>{await waitForFavoriteSync();f.db.meta.rows.clear();f.db.favorites.rows.clear();f.uid='alice';f.load.mockReset().mockResolvedValue(['cloud']);f.save.mockReset().mockResolvedValue(undefined);vi.stubGlobal('navigator',{onLine:true});});
describe('favoris automatiques et isolation des comptes',()=>{
 it('retrouve les favoris distants à la connexion sur un nouvel appareil',async()=>{await syncAccountFavorites();expect(await f.db.favorites.toArray()).toEqual([{id:'cloud'}]);});
 it('envoie aussi les retraits et conserve la file si le réseau échoue',async()=>{
  await f.db.meta.put({key:'favorite-owner',value:'alice'});await f.db.meta.put({key:'favorite-pending:alice',value:{old:false,new:true}});
  f.save.mockRejectedValueOnce(Error('offline'));await syncAccountFavorites();expect((await f.db.meta.get('favorite-pending:alice')).value).toEqual({old:false,new:true});
  f.load.mockResolvedValue(['new']);await syncAccountFavorites();expect(f.save).toHaveBeenCalledWith('old',false);expect(f.save).toHaveBeenCalledWith('new',true);expect((await f.db.meta.get('favorite-pending:alice')).value).toEqual({});expect(await f.db.favorites.toArray()).toEqual([{id:'new'}]);
 });
 it('cache les favoris après déconnexion et ne les copie pas au compte suivant',async()=>{
  await syncAccountFavorites();f.uid=undefined;await syncAccountFavorites();expect(await f.db.favorites.toArray()).toEqual([]);
  f.uid='bob';f.load.mockResolvedValue(['bob-place']);await syncAccountFavorites();expect(await f.db.favorites.toArray()).toEqual([{id:'bob-place'}]);expect((await f.db.meta.get('favorite-cache:alice')).value).toEqual([{id:'cloud'}]);
 });
 it('ignore une ancienne réponse après changement de compte pendant le chargement',async()=>{
  let resolve!:(v:string[])=>void;f.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue(['bob-place']);
  const running=syncAccountFavorites();while(!resolve)await Promise.resolve();f.uid='bob';void syncAccountFavorites();resolve(['alice-place']);await running;await waitForFavoriteSync();expect(await f.db.favorites.toArray()).toEqual([{id:'bob-place'}]);
 });
});

it('ne relit pas les favoris lors des retours répétés dans la même journée',async()=>{await syncAccountFavorites();await syncAccountFavorites();await syncAccountFavorites();expect(f.load).toHaveBeenCalledTimes(1);});
it('un budget épuisé n’empêche pas l’envoi d’un favori',async()=>{
 await f.db.meta.put({key:'firebase-read-budget-v1',value:{day:20261002,automatic:50,manual:0}});
 await f.db.meta.put({key:'favorite-pending:alice',value:{new:true}});await syncAccountFavorites();expect(f.save).toHaveBeenCalledWith('new',true);
});
