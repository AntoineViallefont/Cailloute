import { db, native } from './store';
import { accountDeletionInProgress, freeCollaborationEnabled, getFreeSession, exchangeAccountBackup } from './free-cloud';
import { backupStats, cleanStats, plusStats, statsDelta, zeroStats, type Stats } from './account-backup-model';
interface LocalState { device:string; counts:Stats; seen:Stats; legacy:Stats; avatarPending?:{id:string;value:string|null} }
const stateKey=(uid:string)=>`account-backup:${uid}`;
const statusKey=(uid:string)=>`account-backup-status:${uid}`;
const running=new Map<string,Promise<void>>();
function active(uid:string){return getFreeSession()?.uid===uid&&!accountDeletionInProgress();}
export async function markAvatarForBackup(uid:string,value:string|null){
 await db.transaction('rw',db.meta,async()=>{
  const key=stateKey(uid);const old=(await db.meta.get(key))?.value as LocalState|undefined;
  const stats=cleanStats((await db.meta.get(`contribution-stats:${uid}`))?.value);
  await db.meta.put({key,value:{...old,device:old?.device||crypto.randomUUID(),counts:old?.counts||zeroStats(),seen:old?.seen||stats,legacy:old?.legacy||stats,avatarPending:{id:crypto.randomUUID(),value}}});
  await db.meta.put({key:statusKey(uid),value:{state:'pending'}});
 });
}
export function syncAccountBackup(force=false):Promise<void>{
 const account=getFreeSession();if(!freeCollaborationEnabled||!account?.termsAccepted||accountDeletionInProgress())return Promise.resolve();
 if(running.has(account.uid)){
  const pending=running.get(account.uid)!;
  return force?pending.then(()=>active(account.uid)?syncAccountBackup(true):undefined):pending;
 }
 const execute=()=>perform(account.uid,force);
 const work=(typeof navigator!=='undefined'&&navigator.locks ? navigator.locks.request(`cailloute-account-backup:${account.uid}`,execute) : execute()).catch(async(error)=>{if(active(account.uid))await db.meta.put({key:statusKey(account.uid),value:{state:'error',message:'Sauvegarde en attente. Vérifiez Internet puis réessayez.'}});}).finally(()=>running.delete(account.uid));
 running.set(account.uid,work);return work;
}
async function perform(uid:string,force:boolean){
 if(!active(uid))return;
 const key=stateKey(uid),statsKey=`contribution-stats:${uid}`,avatarKey=`profile-avatar:${uid}`;
 const snapshot=await db.transaction('rw',db.meta,async()=>{
  const stats=cleanStats((await db.meta.get(statsKey))?.value),old=(await db.meta.get(key))?.value as LocalState|undefined;
  const state:LocalState=old||{device:crypto.randomUUID(),counts:zeroStats(),seen:stats,legacy:stats};
  const delta=statsDelta(stats,state.seen);state.counts=plusStats(state.counts,delta);state.seen=stats;
  const status=(await db.meta.get(statusKey(uid)))?.value as any;
  if(!force&&old&&!state.avatarPending&&!delta.added&&!delta.edited&&status?.state==='saved'&&Date.now()-status.at<300000)return null;
  await db.meta.put({key,value:state});await db.meta.put({key:statusKey(uid),value:{state:'pending'}});
  const avatar=(await db.meta.get(avatarKey))?.value;
  return {state,stats,avatar:typeof avatar==='string'?avatar:null};
 });
 if(!snapshot||!active(uid))return;
 const {state,stats}=snapshot;
 const remote=await exchangeAccountBackup(uid,{device:state.device,counts:state.counts,legacy:state.legacy,initialAvatar:snapshot.avatar,...(state.avatarPending?{avatar:state.avatarPending.value}:{})});
 if(!active(uid))return;
 const restored=backupStats(remote);
 await db.transaction('rw',db.meta,async()=>{
  if(!active(uid))return;
  const current=(await db.meta.get(key))?.value as LocalState|undefined;if(!current)return;
  const extra=statsDelta(cleanStats((await db.meta.get(statsKey))?.value),stats);
  await db.meta.put({key:statsKey,value:plusStats(restored,extra)});
  const sameAvatar=current.avatarPending?.id===state.avatarPending?.id;
  if(sameAvatar){delete current.avatarPending;await db.meta.put({key:avatarKey,value:remote.avatar});}
  current.seen=restored;await db.meta.put({key,value:current});
  await db.meta.put({key:statusKey(uid),value:{state:current.avatarPending||extra.added||extra.edited?'pending':'saved',at:Date.now()}});
 });
 // La copie native reflète aussi les suppressions : elle ne doit pas ressusciter un ancien portrait.
 if(native&&active(uid)){
  const {Filesystem,Directory,Encoding}=await import('@capacitor/filesystem');
  const value=(await db.meta.get(avatarKey))?.value;const path=`avatars/${encodeURIComponent(avatarKey)}.txt`;
  if(typeof value==='string')await Filesystem.writeFile({path,data:value,directory:Directory.Data,encoding:Encoding.UTF8,recursive:true});
  else await Filesystem.deleteFile({path,directory:Directory.Data}).catch(()=>{});
 }
}
