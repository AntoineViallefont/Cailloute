import {offlineMap} from './map-cache';
import { db } from './store';
import { accountDeletionInProgress,freeReadsLeft,freeCollaborationEnabled,getFreeSession,setFreeFavorite,loadFreeFavoriteChanges,type FreeCursor } from './free-cloud';
let favoriteSync: Promise<void> | null = null;
let favoriteSyncAgain=false;
export function waitForFavoriteSync(): Promise<void> {return favoriteSync || Promise.resolve();}
export function syncAccountFavorites(): Promise<void> {
 if(accountDeletionInProgress())return Promise.resolve();
 if(!freeCollaborationEnabled)return Promise.resolve();
 if(favoriteSync){favoriteSyncAgain=true;return favoriteSync;}
 favoriteSyncAgain=false;
 const startedOwner=getFreeSession()?.uid;
 favoriteSync=(async()=>{
   const account=getFreeSession(), owner=account?.uid || '';
   const current=await db.meta.get('favorite-owner');
   if(current?.value!==owner){
     await db.transaction('rw',db.meta,db.favorites,async()=>{
       if(current?.value)await db.meta.put({key:`favorite-cache:${current.value}`,value:await db.favorites.toArray()});
       await db.favorites.clear();
       const cache=owner?await db.meta.get(`favorite-cache:${owner}`):undefined;
       if(Array.isArray(cache?.value))await db.favorites.bulkPut(cache.value);
       await db.meta.put({key:'favorite-owner',value:owner});
     });
   }
   if(!account || offlineMap())return;
   const key=`favorite-pending:${owner}`;
   const pending=((await db.meta.get(key))?.value || {}) as Record<string,boolean>;
   for(const [id,value]of Object.entries(pending)) {
     if(getFreeSession()?.uid!==owner)return;
     await setFreeFavorite(id,value===true);
     await db.transaction('rw',db.meta,async()=>{const next=((await db.meta.get(key))?.value || {}) as Record<string,boolean>;if(next[id]===value){delete next[id];await db.meta.put({key,value:next});}});
   }
   const stateKey=`favorite-sync:${owner}`;
   let state=((await db.meta.get(stateKey))?.value || {cursor:null,next:0}) as {cursor:FreeCursor|null;next:number};
   if(!account.isAdmin && state.next>Date.now())return;
   for(;;){
     const size=Math.min(10,(await freeReadsLeft())-2);if(size<1)return;
     const page=await loadFreeFavoriteChanges(state.cursor,size);
     if(getFreeSession()?.uid!==owner)return;
     state={cursor:page.cursor,next:page.hasMore?0:Date.now()+86400000};
     await db.transaction('rw',db.favorites,db.meta,async()=>{
       const pending=((await db.meta.get(key))?.value || {}) as Record<string,boolean>;
       for(const item of page.changes){const value=pending[item.id]??item.value;const exists=!!(await db.favorites.get(item.id));if(value && !exists)await db.favorites.put({id:item.id});else if(!value && exists)await db.favorites.delete(item.id);}
       await db.meta.put({key:stateKey,value:state});
     });
     if(!page.hasMore)return;
   }
 })().catch(()=>{/* Les actions hors ligne restent en attente pour la prochaine connexion. */}).finally(()=>{favoriteSync=null;if(favoriteSyncAgain || getFreeSession()?.uid!==startedOwner)void syncAccountFavorites();});
 return favoriteSync;
}
