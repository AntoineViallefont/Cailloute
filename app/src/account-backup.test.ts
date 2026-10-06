import {beforeEach,it,expect,vi} from 'vitest';
import {mergeBackup,type AccountBackup} from './account-backup-model';
const harness=vi.hoisted(()=>({rows:new Map<string,unknown>(),uid:'alice',remote:undefined as any,offline:false,loseReply:false,exchanges:0}));
vi.mock('./store',()=>({native:false,db:{meta:{get:async(key:string)=>harness.rows.has(key)?{key,value:structuredClone(harness.rows.get(key))}:undefined,put:async(row:any)=>{harness.rows.set(row.key,structuredClone(row.value));}},transaction:async(...args:any[])=>args.at(-1)()}}));
vi.mock('./free-cloud',()=>({freeCollaborationEnabled:true,accountDeletionInProgress:()=>false,getFreeSession:()=>({uid:harness.uid,termsAccepted:true}),exchangeAccountBackup:async(uid:string,input:any)=>{
 harness.exchanges++;if(harness.offline)throw Error('hors connexion');
 const {mergeBackup}=await import('./account-backup-model');harness.remote=mergeBackup(harness.remote,input);
 if(harness.loseReply){harness.loseReply=false;throw Error('réponse perdue');}return structuredClone(harness.remote);
}}));
import {syncAccountBackup,markAvatarForBackup} from './account-backup';
beforeEach(()=>{harness.rows.clear();harness.uid='alice';harness.remote=undefined;harness.offline=false;harness.loseReply=false;harness.exchanges=0;});
it('sauvegarde puis restaure après effacement complet des données locales',async()=>{
 harness.rows.set('contribution-stats:alice',{added:4,edited:9});harness.rows.set('profile-avatar:alice','data:image/webp;base64,YQ==');
 await syncAccountBackup(true);harness.rows.clear();await syncAccountBackup(true);
 expect(harness.rows.get('contribution-stats:alice')).toEqual({added:4,edited:9});expect(harness.rows.get('profile-avatar:alice')).toBe('data:image/webp;base64,YQ==');
});
it('reprend hors connexion et après réponse perdue sans doubler les nouveaux points',async()=>{
 await syncAccountBackup(true);harness.rows.set('contribution-stats:alice',{added:2,edited:3});harness.offline=true;await syncAccountBackup(true);
 expect((harness.rows.get('account-backup-status:alice') as any).state).toBe('error');
 harness.offline=false;harness.loseReply=true;await syncAccountBackup(true);await syncAccountBackup(true);
 expect(harness.rows.get('contribution-stats:alice')).toEqual({added:2,edited:3});
});
it('sauvegarde la suppression explicite du portrait et restaure son absence',async()=>{
 harness.rows.set('profile-avatar:alice','data:image/webp;base64,YQ==');await syncAccountBackup(true);
 await markAvatarForBackup('alice',null);await syncAccountBackup(true);harness.rows.clear();await syncAccountBackup(true);
 expect(harness.rows.get('profile-avatar:alice')).toBeNull();
});
it('ne transmet pas les compteurs ou la photo locale d’un autre compte',async()=>{
 harness.rows.set('contribution-stats:alice',{added:20,edited:30});harness.rows.set('profile-avatar:alice','data:image/webp;base64,YQ==');harness.uid='bob';await syncAccountBackup(true);
 expect(harness.remote.legacy).toEqual({added:0,edited:0});expect(harness.remote.avatar).toBeNull();
});
