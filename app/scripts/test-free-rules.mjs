import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp, Timestamp, collection, getDocs, query, limit, where } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-cailloute-free', firestore: { host: '127.0.0.1', port: 8189, rules: readFileSync('../firestore.rules', 'utf8') } });
const user = (uid='alice', verified=true, email=`${uid}@example.test`) => env.authenticatedContext(uid, {email,email_verified:verified}).firestore();
const admin = user('owner',true,'admin-secondaire@example.invalid');
const anon = env.unauthenticatedContext().firestore();
const profile = name => ({ created:serverTimestamp(), name, nameKey:'u_'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(), terms:'2026-09-17',adult:true,blocked:false,added:0,edited:0,deleted:0,day:Timestamp.fromMillis(0),dailyAdded:0,dailyEdited:0,dailyDeleted:0,recent:[],lastOp:'',lastPlace:'' });
const place = (id, version=1) => ({id,version,name:'Parc',category:'playground',lat:45.75,lon:4.83,address:'',city:'',hours:'',description:'',age:'',access:'',wheelchair:null,changing_table:null,drinking_water:null,free:null,fenced:null,elevator:null,sources:[],rating:null,review_count:0,community:true,photo_count:0});
const today=()=>{const d=new Date();d.setUTCHours(0,0,0,0);return Timestamp.fromDate(d)};
async function createProfile(db,uid,name) { const b=(await getDoc(doc(db,'system','budget'))).data();const batch=writeBatch(db);batch.set(doc(db,'members',uid),profile(name));batch.set(doc(db,'usernames','u_'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()),{uid});batch.update(doc(db,'system','budget'),{members:b.members+1,lastType:'member',lastId:uid});return batch.commit(); }
async function mutate(db,uid,id,kind,opId, modify=()=>{}, memberModify=()=>{}, photoPayload=null) {
 const m=(await getDoc(doc(db,'members',uid))).data(); const s=await getDoc(doc(db,'shared',id));const old=s.data();
 const category=kind==='place.create'?'added':kind==='place.delete'?'deleted':'edited';const daily=category==='added'?'dailyAdded':category==='deleted'?'dailyDeleted':'dailyEdited';
 const same = m.day.toMillis() === today().toMillis(); const counts={dailyAdded:same?m.dailyAdded:0,dailyEdited:same?m.dailyEdited:0,dailyDeleted:same?m.dailyDeleted:0};
 const update={...m,...counts,[category]:m[category]+1,[daily]:counts[daily]+1,day:today(),recent:[...m.recent,opId].slice(-64),lastOp:opId,lastPlace:id};memberModify(update);
 const value={place:{...(old?.place || place(id)),version:(old?.version||0)+1},reviews:old?.reviews||{},deleted:false,updated:serverTimestamp(),version:(old?.version||0)+1,cell:'183:19',lastOp:opId,by:uid,kind,lastPhoto:''};
 if(kind==='place.delete'){value.place=null;value.reviews={};value.deleted=true;} modify(value);
 const budget=(await getDoc(doc(db,'system','budget'))).data();const batch=writeBatch(db);let delta=0;
 if(kind==='photo.add') { value.lastPhoto=`${id}_${opId}`; batch.set(doc(db,'previews',value.lastPhoto),{placeId:id,user_id:uid,author:m.name,url:photoPayload?.url||'data:image/jpeg;base64,YQ==',caption:'',privacy_reviewed:true,rights_accepted:true,created:serverTimestamp(),lastOp:opId});delta=1; }
 if(kind==='photo.delete') {value.lastPhoto=photoPayload.id;batch.delete(doc(db,'previews',value.lastPhoto));delta=-1;}
 if(value.place) value.place.photo_count=(old?.place?.photo_count||0)+delta;
 if(!old||delta)batch.update(doc(db,'system','budget'),{places:budget.places+(old?0:1),previews:budget.previews+delta,lastType:'shared',lastId:id});batch.set(doc(db,'members',uid),update);batch.set(doc(db,'shared',id),value);return batch.commit();
}
async function moderate(actor,uid,action,id,reason='Abus confirmé après examen') {
 const moderation={id,action,reason,until:Timestamp.fromMillis(action==='suspend_7'?Date.now()+7*86400000:action==='suspend_30'?Date.now()+30*86400000:0),decidedAt:serverTimestamp()};
 const b=writeBatch(actor);b.update(doc(actor,'members',uid),{blocked:['ban','suspend_7','suspend_30'].includes(action),moderation});b.set(doc(actor,'members',uid,'decisions',id),{...moderation,by:'owner'});return b.commit();
}
let count=0;
async function test(name,fn){await fn();count++;console.log(`✓ ${name}`)}
try{
 await env.clearFirestore(); await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(),'system','budget'),{members:0,places:0,previews:0,lastType:'',lastId:''}); });const db=user();
 await test('anonyme : lecture bornée, écriture refusée',async()=>{await assertSucceeds(getDocs(query(collection(anon,'shared'),limit(20))));await assertFails(getDocs(collection(anon,'shared')));await assertFails(setDoc(doc(anon,'members','alice'),profile('Alice')))});
 await test('profil appartient au compte, privilèges non injectables',async()=>{await assertFails(setDoc(doc(db,'members','bob'),profile('Bob')));await assertFails(setDoc(doc(db,'members','alice'),{...profile('Alice'),blocked:true}));await assertSucceeds(createProfile(db,'alice','Alice'));await assertSucceeds(createProfile(user('bob'),'bob','Bob'))});
 await test('compte non vérifié refusé',async()=>{await assertFails(mutate(user('alice',false),'alice','p1','place.create','op0'))});
 await test('création atomique valide',()=>assertSucceeds(mutate(db,'alice','p1','place.create','op1')));
 await test('compteur obligatoire',()=>assertFails(updateDoc(doc(db,'shared','p1'),{'place.name':'Injection',updated:serverTimestamp(),version:2})));
 await test('rejeu interdit',()=>assertFails(mutate(db,'alice','p1','place.edit','op1')));
 await test('conflit version refusé',()=>assertFails(mutate(db,'alice','p1','place.edit','op2',d=>{d.version=1;d.place.version=1})));
 await test('photo/injection payload interdit',()=>assertFails(mutate(db,'alice','p1','place.edit','op2',d=>{d.place.photo='data:image/jpeg;base64,x'})));
 await test('modification de lieu par autre contributeur autorisée',()=>assertSucceeds(mutate(user('bob'),'bob','p1','place.edit','op-bob',d=>{d.place.name='Parc corrigé'})));
 const review={id:'alice',user_id:'alice',author:'Alice',place_id:'p1',stars:4,text:'Très bien',created:'2026-09-17',updated:'2026-09-17',votes:0,voters:[]};
 await test('avis personnel valide',()=>assertSucceeds(mutate(db,'alice','p1','review.save','op3',d=>{d.reviews={alice:review}})));
 await test('avis d’un tiers protégé',()=>assertFails(mutate(user('bob'),'bob','p1','review.delete','op4',d=>{d.reviews={}})));
 await test('signalement privé, décision administrateur',async()=>{const ref=doc(user('bob'),'reports','bob');await assertSucceeds(setDoc(ref,{uid:'bob',placeId:'p1',reviewId:'alice',reason:'Abus',status:'pending',created:serverTimestamp()}));await assertFails(getDoc(doc(db,'reports','bob')));await assertFails(updateDoc(ref,{status:'removed'}));await assertSucceeds(updateDoc(doc(admin,'reports','bob'),{status:'dismissed'}))});
 await test('suppression efface fiche et avis',async()=>{await assertSucceeds(mutate(db,'alice','p1','place.delete','op5'));const d=(await getDoc(doc(db,'shared','p1'))).data();if(d.place!==null||Object.keys(d.reviews).length)throw Error('Données conservées');await assertFails(mutate(db,'alice','p1','place.edit','op6'))});
 await test('quota créations côté serveur',async()=>{for(let i=2;i<=5;i++)await assertSucceeds(mutate(db,'alice',`p${i}`,'place.create',`create${i}`));await assertFails(mutate(db,'alice','p6','place.create','create6'))});
 await test('blocage administrateur seulement',async()=>{await assertFails(updateDoc(doc(db,'members','alice'),{blocked:false}));await assertSucceeds(moderate(admin,'alice','ban','initial-ban'));await assertFails(mutate(db,'alice','p2','place.edit','blockedop'))});
 await test('aperçu compact ajouté et compteur exact',async()=>{await assertSucceeds(mutate(user('bob'),'bob','p2','photo.add','preview1'));const budget=(await getDoc(doc(user('bob'),'system','budget'))).data();if(budget.previews!==1)throw Error('Compteur aperçu');});
 await test('aperçu trop lourd rejeté',()=>assertFails(mutate(user('bob'),'bob','p2','photo.add','previewbad',()=>{},()=>{},{slot:1,url:'data:image/jpeg;base64,'+'a'.repeat(53360)})));
 await test('plus de deux photos par lieu autorisées',async()=>{await assertSucceeds(mutate(user('bob'),'bob','p2','photo.add','preview2',()=>{},()=>{},{slot:1}));await assertSucceeds(mutate(user('bob'),'bob','p2','photo.add','preview3',()=>{},()=>{},{slot:2}));});
 await test('aperçus consultables anonymement par lieu avec pagination',async()=>{await assertSucceeds(getDoc(doc(anon,'previews','p2_preview1')));const rows=await assertSucceeds(getDocs(query(collection(anon,'previews'),where('placeId','==','p2'),limit(20))));if(rows.size!==3)throw Error('Photos manquantes');await assertFails(getDocs(collection(anon,'previews')));});
 await test('une source non partagée impose des lectures séparées pour préserver les autres photos',async()=>{await assertFails(getDocs(query(collection(anon,'previews'),where('placeId','in',['p2','source-sans-contribution']),limit(20))));const rows=await assertSucceeds(getDocs(query(collection(anon,'previews'),where('placeId','==','p2'),limit(20))));if(rows.size!==3)throw Error('Photos fusionnées manquantes');});
 await test('suppression photo sans plafond de slots',async()=>{await assertSucceeds(mutate(user('bob'),'bob','p2','photo.delete','delete-photo',()=>{},()=>{},{id:'p2_preview3'}));if((await getDoc(doc(anon,'previews','p2_preview3'))).exists())throw Error('Photo non supprimée');});
 await test('suppression du lieu rend toutes ses photos inaccessibles',async()=>{await assertSucceeds(mutate(user('bob'),'bob','p2','place.delete','delete-with-previews'));await assertFails(getDoc(doc(anon,'previews','p2_preview1')));await assertFails(getDocs(query(collection(anon,'previews'),where('placeId','==','p2'),limit(20))));});
 await test('compteur global non falsifiable',()=>assertFails(updateDoc(doc(user('bob'),'system','budget'),{previews:0,places:0,members:0})));
 await test('plafond global de fiches coupe les créations',async()=>{await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'system','budget'),{places:3000}));await assertFails(mutate(user('bob'),'bob','over-cap','place.create','full'));await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'system','budget'),{places:5}));});
 await test('contact privé unique par jour',async()=>{await assertSucceeds(setDoc(doc(user('bob'),'contacts','bob'),{uid:'bob',message:'Bonjour',created:serverTimestamp()}));await assertFails(setDoc(doc(user('bob'),'contacts','bob'),{uid:'bob',message:'Encore',created:serverTimestamp()}));await assertFails(getDoc(doc(db,'contacts','bob')));await assertSucceeds(getDoc(doc(admin,'contacts','bob')));});
 await test('modération retire effectivement un avis et incrémente les deux versions',async()=>{const value=(await getDoc(doc(user('bob'),'shared','p4'))).data();await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'shared','p4'),{reviews:{alice:{...review,place_id:'p4'}}}));await assertFails(updateDoc(doc(user('bob'),'shared','p4'),{reviews:{},updated:serverTimestamp(),version:value.version+1,place:{...value.place,version:value.version+1}}));await assertSucceeds(updateDoc(doc(admin,'shared','p4'),{reviews:{},updated:serverTimestamp(),version:value.version+1,place:{...value.place,version:value.version+1}}));});
 await test('quota dix éditions et deux suppressions par jour',async()=>{const c=user('charlie');await assertSucceeds(createProfile(c,'charlie','Charlie'));for(let i=0;i<10;i++)await assertSucceeds(mutate(c,'charlie','p3','place.edit',`edit-${i}`));await assertFails(mutate(c,'charlie','p3','place.edit','edit-11'));await assertSucceeds(mutate(c,'charlie','p3','place.delete','del-1'));await assertSucceeds(mutate(c,'charlie','p4','place.delete','del-2'));await assertFails(mutate(c,'charlie','p5','place.delete','del-3'));});
 await test('quotas quotidiens renouvelés sans remettre les compteurs cumulés à zéro',async()=>{const c=user('charlie');const before=(await getDoc(doc(c,'members','charlie'))).data();await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','charlie'),{day:Timestamp.fromMillis(today().toMillis()-86400000)}));await assertSucceeds(mutate(c,'charlie','p5','place.edit','next-day'));const after=(await getDoc(doc(c,'members','charlie'))).data();if(after.edited!==before.edited+1||after.dailyEdited!==1||after.dailyDeleted!==0)throw Error('Compteurs incohérents');});
 await test('fausse date client et injection compteurs refusées',async()=>{await assertFails(mutate(user('charlie'),'charlie','p5','place.edit','fake-date',()=>{},d=>{d.day=Timestamp.fromMillis(0)}));await assertFails(mutate(user('charlie'),'charlie','p5','place.edit','fake-counter',()=>{},d=>{d.edited=0}));});
 await test('créateur sans plafond quotidien, compte ordinaire toujours limité',async()=>{await assertSucceeds(createProfile(admin,'owner','Antoine'));for(let i=0;i<7;i++)await assertSucceeds(mutate(admin,'owner',`owner-${i}`,'place.create',`owner-add-${i}`));for(let i=0;i<12;i++)await assertSucceeds(mutate(admin,'owner','owner-0','place.edit',`owner-edit-${i}`));for(let i=1;i<5;i++)await assertSucceeds(mutate(admin,'owner',`owner-${i}`,'place.delete',`owner-delete-${i}`));});
 await test('favoris privés et transférables uniquement par leur propriétaire',async()=>{await assertSucceeds(setDoc(doc(db,'members','alice','favorites','p5'),{id:'p5',updated:serverTimestamp()}));await assertSucceeds(getDocs(collection(db,'members','alice','favorites')));await assertFails(getDocs(collection(user('bob'),'members','alice','favorites')));await assertFails(getDoc(doc(anon,'members','alice','favorites','p5')));});

 await test('votes : ajout, changement, retrait, auto-vote et falsification', async()=>{
   const ref = d=>doc(d,'shared','vote-place');
   await env.withSecurityRulesDisabled(async ctx=>{
     const original=(await getDoc(doc(ctx.firestore(),'shared','owner-0'))).data();
     await setDoc(ref(ctx.firestore()),{...original, reviews:{alice:{...review,place_id:'vote-place'}}, deleted:false});
     await updateDoc(doc(ctx.firestore(),'members','alice'),{blocked:false});
   });
   const vote=async(who,up,down,patch={})=>{
     const current=(await getDoc(ref(who))).data();
     return updateDoc(ref(who),{reviews:{alice:{...current.reviews.alice,voters:up,votes:up.length,downvoters:down,downvotes:down.length,...patch}},version:current.version+1,place:{...current.place,version:current.version+1},updated:serverTimestamp(),voteReview:'alice'});
   };
   const bob=user('bob');
   await assertFails(vote(user('alice'),['alice'],[]));
   await assertFails(vote(anon,['bob'],[]));
   await assertFails(vote(user('bob',false),['bob'],[]));
   await assertSucceeds(vote(bob,['bob'],[]));
   await assertSucceeds(vote(bob,['bob'],[]));
   await assertFails(vote(bob,['bob'],['bob']));
   await assertFails(vote(bob,['bob','charlie'],[]));
   await assertFails(vote(bob,['bob'],[],{votes:100}));
   await assertFails(vote(bob,['bob'],[],{text:'Falsifié'}));
   await assertSucceeds(vote(bob,[],['bob']));
   await assertSucceeds(vote(user('charlie'),['charlie'],['bob']));
   await assertFails(vote(bob,[],[]));
   await assertSucceeds(vote(bob,['charlie'],[]));
   await assertFails(mutate(user('alice'),'alice','vote-place','review.save','erase-votes',d=>{d.reviews.alice={...d.reviews.alice,votes:0,voters:[]};}));
   await assertSucceeds(mutate(user('alice'),'alice','vote-place','review.save','edit-voted-review',d=>{d.reviews.alice={...d.reviews.alice,text:'Avis corrigé'};}));
   await assertSucceeds(vote(bob,['charlie','bob'],[]));
   await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','bob'),{blocked:true}));
   await assertFails(vote(bob,['charlie','bob'],[]));
 });
 await test('sanctions motivées, historique privé immuable, avertissement et expiration',async()=>{
   const bob=user('bob');
   await assertFails(moderate(bob,'bob','restore','self-restore'));
   await assertFails(moderate(admin,'bob','warning','short-reason','x'));
   await assertSucceeds(moderate(admin,'bob','warning','warning-1'));
   await assertSucceeds(mutate(bob,'bob','owner-0','place.edit','after-warning'));
   await assertSucceeds(moderate(admin,'bob','suspend_7','seven-days'));
   await assertFails(mutate(bob,'bob','owner-0','place.edit','during-suspension'));
   await assertSucceeds(getDoc(doc(bob,'members','bob','decisions','seven-days')));
   await assertFails(getDoc(doc(user('alice'),'members','bob','decisions','seven-days')));
   await assertFails(updateDoc(doc(admin,'members','bob','decisions','seven-days'),{reason:'Réécriture'}));
   await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','bob'),{'moderation.until':Timestamp.fromMillis(Date.now()-1000)}));
   await assertSucceeds(mutate(bob,'bob','owner-0','place.edit','after-expiration'));
   await assertSucceeds(moderate(admin,'bob','suspend_30','thirty-days'));
   await assertFails(mutate(bob,'bob','owner-0','place.edit','during-thirty'));
   await assertSucceeds(moderate(admin,'bob','restore','restored'));
   await assertSucceeds(mutate(bob,'bob','owner-0','place.edit','after-restore'));
   await assertFails(updateDoc(doc(admin,'members','bob'),{blocked:true}));
 });
 await test('deux adresses administrateur vérifiées, autres comptes refusés',async()=>{
   await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'admin','access'),{enabled:true}));
   await assertSucceeds(getDoc(doc(user('gmail',true,'admin-principal@example.invalid'),'admin','access')));
   await assertSucceeds(getDoc(doc(admin,'admin','access')));
   await assertFails(getDoc(doc(user('gmail',false,'admin-principal@example.invalid'),'admin','access')));
   await assertFails(getDoc(doc(user('other'),'admin','access')));
 });
 await test('favoris liés au compte, suppression synchronisée, invités refusés',async()=>{
   const a=user('fav',false);const f=doc(a,'members','fav','favorites','p1');
   await assertSucceeds(setDoc(f,{id:'p1',value:true,updated:serverTimestamp()}));
   await assertSucceeds(setDoc(f,{id:'p1',value:false,updated:serverTimestamp()}));
   await assertFails(getDoc(doc(user('other'),'members','fav','favorites','p1')));
   const guest=env.authenticatedContext('guest',{firebase:{sign_in_provider:'anonymous'}}).firestore();
   await assertFails(setDoc(doc(guest,'members','guest','favorites','p1'),{id:'p1',value:true,updated:serverTimestamp()}));
   await assertSucceeds(deleteDoc(f));
 });
 await test('suppression du compte : anonymisation limitée à ses propres avis et photos',async()=>{
   await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),'shared','delete-test'),{place:place('delete-test'),reviews:{alice:{...review,place_id:'delete-test'},bob:{...review,user_id:'bob',id:'bob',author:'Bob',place_id:'delete-test'}},version:1,deleted:false,updated:Timestamp.now()});
    await setDoc(doc(ctx.firestore(),'previews','delete-photo'),{user_id:'alice',placeId:'delete-test',author:'Alice',url:'kept'});
   });
   const ref=doc(db,'shared','delete-test');
   await assertSucceeds(updateDoc(ref,{'reviews.alice.author':'Compte supprimé',version:2,'place.version':2,updated:serverTimestamp()}));
   await assertFails(updateDoc(ref,{'reviews.bob.author':'Compte supprimé',version:3,'place.version':3,updated:serverTimestamp()}));
   await assertFails(updateDoc(ref,{'reviews.alice.text':'Changé',version:3,'place.version':3,updated:serverTimestamp()}));
   await assertSucceeds(updateDoc(doc(db,'previews','delete-photo'),{author:'Compte supprimé'}));
   await assertFails(updateDoc(doc(user('bob'),'previews','delete-photo'),{author:'Compte supprimé'}));
   await assertSucceeds(getDocs(query(collection(db,'previews'),where('user_id','==','alice'),limit(20))));
   const saved=(await getDoc(ref)).data();if(saved.reviews.alice.text!==review.text||saved.reviews.bob.author!=='Bob')throw Error('Contenu altéré');
 });
 await test('suppression de son profil et décrément atomique du compteur uniquement',async()=>{
   const account=user('delete-member');await createProfile(account,'delete-member','À supprimer');
   await assertFails(deleteDoc(doc(account,'members','delete-member')));
   const budget=(await getDoc(doc(account,'system','budget'))).data();const batch=writeBatch(account);
   batch.delete(doc(account,'members','delete-member'));batch.delete(doc(account,'usernames','u_a supprimer'));batch.update(doc(account,'system','budget'),{members:budget.members-1,lastType:'member-delete',lastId:'delete-member'});
   await assertSucceeds(batch.commit());await assertFails(deleteDoc(doc(account,'members','alice')));
 });
 await test('invité : signaler avis, photo ou lieu sans pouvoir contribuer',async()=>{
   const guest=id=>env.authenticatedContext(id,{firebase:{sign_in_provider:'anonymous'}}).firestore();
   const g=guest('report-guest');
   await assertSucceeds(setDoc(doc(g,'reports','report-guest'),{uid:'report-guest',placeId:'delete-test',reviewId:'alice',reason:'À examiner',status:'pending',created:serverTimestamp()}));
   await assertSucceeds(setDoc(doc(guest('photo-guest'),'reports','photo-guest'),{uid:'photo-guest',placeId:'delete-test',reviewId:'',photoId:'delete-photo',reason:'À examiner',status:'pending',created:serverTimestamp()}));
   await assertSucceeds(setDoc(doc(guest('place-guest'),'reports','place-guest'),{uid:'place-guest',placeId:'delete-test',reviewId:'',reason:'À examiner',status:'pending',created:serverTimestamp()}));
   await assertFails(createProfile(g,'report-guest','Invité'));
   await assertFails(updateDoc(doc(g,'shared','delete-test'),{'place.name':'Faux'}));
   await assertFails(getDoc(doc(g,'reports','bob')));
 });
 await test('pseudos uniques : réservation atomique et aucune usurpation',async()=>{
   await assertSucceeds(createProfile(user('nick-a'),'nick-a','Unique Name'));
   await assertSucceeds(createProfile(user('nick-c'),'nick-c','Émilie'));await assertFails(createProfile(user('nick-d'),'nick-d','EMILIE'));
   await assertFails(createProfile(user('nick-b'),'nick-b','UNIQUE NAME'));
   await assertFails(setDoc(doc(user('nick-b'),'usernames','u_unique name'),{uid:'nick-b'}));
   await assertFails(updateDoc(doc(user('nick-a'),'members','nick-a'),{name:'Alice',nameKey:'u_alice'}));
   const nick=user('nick-a');const b=writeBatch(nick);b.set(doc(nick,'usernames','u_nouveau'),{uid:'nick-a'});b.update(doc(nick,'members','nick-a'),{name:'Nouveau',nameKey:'u_nouveau'});b.delete(doc(nick,'usernames','u_unique name'));await assertSucceeds(b.commit());
   await assertFails(deleteDoc(doc(user('nick-b'),'usernames','u_nouveau')));
   await assertFails(deleteDoc(doc(user('nick-a'),'usernames','u_nouveau')));
   await assertFails(setDoc(doc(user('nick-a'),'usernames','u_reserve'),{uid:'nick-a'}));
 });
 await test('badge Avis utile : 3 comptes distincts, majorité, pas d’auto-vote',async()=>{
   const ref=doc(db,'members','alice','badges','helpful');
   const seed=async(voters,downvoters=[])=>env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'shared','helpful-place'),{deleted:false,reviews:{alice:{...review,voters,downvoters}}}));
   const claim=()=>setDoc(ref,{placeId:'helpful-place',reviewId:'alice',earned:serverTimestamp()});
   await seed(['bob','carol']);await assertFails(claim());
   await seed(['bob','bob','carol']);await assertFails(claim());
   await seed(['alice','bob','carol']);await assertFails(claim());
   await seed(['bob','carol','dan'],['e','f','g']);await assertFails(claim());
   await seed(['bob','carol','dan'],['e']);await assertSucceeds(claim());
   await seed([]);await assertSucceeds(getDoc(ref));await assertFails(updateDoc(ref,{reviewId:'bob'}));
 });
 await test('troisième vote : badge attribué atomiquement à l’auteur',async()=>{
   const voter=user('badge-voter');await createProfile(voter,'badge-voter','Badge voter');
   await assertSucceeds(deleteDoc(doc(db,'members','alice','badges','helpful')));
   const before={place:place('badge-vote'),reviews:{alice:{...review,place_id:'badge-vote',voters:['bob','carol'],votes:2,downvoters:[],downvotes:0}},version:1,deleted:false,updated:Timestamp.now(),lastOp:'badge-seed',by:'alice',kind:'review.save',lastPhoto:'',cell:'183:19'};
   await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'shared','badge-vote'),before));
   const b=writeBatch(voter);b.update(doc(voter,'shared','badge-vote'),{...before,place:{...before.place,version:2},version:2,updated:serverTimestamp(),voteReview:'alice',reviews:{alice:{...before.reviews.alice,voters:['bob','carol','badge-voter'],votes:3}}});
   b.set(doc(voter,'members','alice','badges','helpful'),{placeId:'badge-vote',reviewId:'alice',earned:serverTimestamp()});await assertSucceeds(b.commit());
 });
 await test('plusieurs signalements et nouveau signalement après décision le même jour',async()=>{
   const reporter=user('multi-reporter'),id='multi-reporter_'+'a'.repeat(24),id2='multi-reporter_'+'b'.repeat(24);
   const payload={uid:'multi-reporter',placeId:'delete-test',reviewId:'alice',reason:'À examiner',status:'pending',created:serverTimestamp()};
   await assertSucceeds(getDoc(doc(reporter,'reports',id)));
   await assertSucceeds(setDoc(doc(reporter,'reports',id),payload));
   await assertSucceeds(setDoc(doc(reporter,'reports',id2),{...payload,reviewId:'bob'}));
   await assertFails(setDoc(doc(reporter,'reports',id),{...payload,reason:'Doublon en attente'}));
   await assertSucceeds(updateDoc(doc(admin,'reports',id),{status:'dismissed'}));
   await assertSucceeds(setDoc(doc(reporter,'reports',id),payload));
   await assertFails(setDoc(doc(reporter,'reports','other_'+'c'.repeat(24)),payload));
   await assertFails(setDoc(doc(reporter,'reports',id2),{...payload,reviewId:'alice'}));
 });
 await test('suppression du compte : nettoyage privé limité au propriétaire',async()=>{
   const reporter=user('multi-reporter');
   await assertSucceeds(getDocs(query(collection(reporter,'reports'),where('uid','==','multi-reporter'),limit(20))));
   await assertFails(getDocs(query(collection(reporter,'reports'),limit(20))));
   await assertFails(deleteDoc(doc(user('other'),'reports','multi-reporter_'+'a'.repeat(24))));
   await assertSucceeds(deleteDoc(doc(reporter,'reports','multi-reporter_'+'a'.repeat(24))));
   await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'contacts','multi-reporter'),{uid:'multi-reporter',message:'Privé',created:Timestamp.now()}));
   await assertFails(deleteDoc(doc(user('other'),'contacts','multi-reporter')));
   await assertSucceeds(deleteDoc(doc(reporter,'contacts','multi-reporter')));
   await assertSucceeds(deleteDoc(doc(reporter,'contacts','multi-reporter')));
 });
 await test('administrateur : suppression définitive de l’avis signalé et de ses votes',async()=>{
   const ref=doc(admin,'shared','delete-test'),before=(await getDoc(ref)).data();
   const b=writeBatch(admin);const reviews={...before.reviews};delete reviews.bob;
   b.update(ref,{reviews,version:before.version+1,place:{...before.place,version:before.version+1},updated:serverTimestamp()});
   b.update(doc(admin,'reports','multi-reporter_'+'b'.repeat(24)),{status:'removed'});
   await assertSucceeds(b.commit());
   const after=(await getDoc(ref)).data();if(after.reviews.bob || !after.reviews.alice)throw Error('Avis ciblé conservé ou autre avis supprimé');
 });
 await test('transports nationaux : six modes et conservation de plus de six lignes',async()=>{
   const owner=user('national-transport');await assertSucceeds(createProfile(owner,'national-transport','Transport national'));
   await assertSucceeds(mutate(owner,'national-transport','transport-national','place.create','national-create',p=>{p.place.transit_modes=['metro','tram','bus','train','ferry','cable'];p.place.transit_lines=Array.from({length:12},(_,i)=>String(i+1));}));
   await assertFails(mutate(owner,'national-transport','transport-national','place.edit','invalid-mode',p=>{p.place.transit_modes=['plane'];}));
 });
 await test('modération ciblée : photo supprimée avec compteur, édition et non-admin refusé',async()=>{
  const id='moderated-photo',photoId='moderated-photo_img',reportId='photo-report';
  await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await setDoc(doc(d,'shared',id),{place:{...place(id),photo_count:1},reviews:{},deleted:false,updated:Timestamp.now(),version:1,cell:'183:19',lastOp:'seed',by:'alice',kind:'photo.add',lastPhoto:photoId});await setDoc(doc(d,'previews',photoId),{placeId:id,user_id:'alice',author:'Alice',url:'data:image/webp;base64,YQ==',caption:'Ancienne légende',privacy_reviewed:true,rights_accepted:true,created:Timestamp.now(),lastOp:'img'});await setDoc(doc(d,'reports',reportId),{uid:'alice',placeId:id,photoId,reviewId:'',reason:'Visage visible',status:'pending',created:Timestamp.now()});await updateDoc(doc(d,'system','budget'),{previews:10});});
  const old=(await getDoc(doc(admin,'shared',id))).data();
  const edit=writeBatch(admin);edit.update(doc(admin,'shared',id),{place:{...old.place,version:2},version:2,updated:serverTimestamp(),lastModeration:reportId+'_edit',moderationReport:reportId,lastPhoto:photoId});edit.update(doc(admin,'previews',photoId),{url:'data:image/webp;base64,Yg==',caption:'Corrigée'});edit.update(doc(admin,'reports',reportId),{status:'corrected'});await assertSucceeds(edit.commit());
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'reports',reportId),{status:'pending'}));
  const remove=db=>{const b=writeBatch(db);b.update(doc(db,'shared',id),{place:{...old.place,version:3,photo_count:0},version:3,updated:serverTimestamp(),lastModeration:reportId+'_remove',moderationReport:reportId,lastPhoto:photoId});b.delete(doc(db,'previews',photoId));b.update(doc(db,'system','budget'),{previews:9,lastType:'moderation',lastId:photoId});b.update(doc(db,'reports',reportId),{status:'removed'});return b.commit();};
  await assertFails(remove(user('bob')));await assertSucceeds(remove(admin));if((await getDoc(doc(admin,'previews',photoId))).exists())throw Error('Photo conservée');
 });
 await test('modération ciblée : corriger un avis, sans changer son auteur ou ses votes',async()=>{
  const id='moderated-review',rid='review-report',r={id:'alice',user_id:'alice',author:'Alice',place_id:id,stars:4,text:'Ancien texte',created:'2026-10-01',updated:'2026-10-01',votes:1,voters:['bob'],downvotes:0,downvoters:[]};
  await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await setDoc(doc(d,'shared',id),{place:place(id),reviews:{alice:r},deleted:false,version:1,updated:Timestamp.now(),cell:'183:19'});await setDoc(doc(d,'reports',rid),{uid:'bob',placeId:id,reviewId:'alice',photoId:'',status:'pending',created:Timestamp.now(),reason:'Donnée personnelle'});});
  const edit=patch=>{const b=writeBatch(admin);b.update(doc(admin,'shared',id),{place:place(id,2),reviews:{alice:{...r,text:'Texte corrigé',updated:'2026-10-02',...patch}},version:2,updated:serverTimestamp(),lastModeration:rid+'_edit',moderationReport:rid});b.update(doc(admin,'reports',rid),{status:'corrected'});return b.commit();};
  await assertFails(edit({author:'Admin'}));await assertFails(edit({votes:0,voters:[]}));await assertSucceeds(edit({}));
 });
 await test('modération ciblée : modifier puis supprimer le lieu et empêcher le rejeu',async()=>{
  const id='moderated-place',rid='place-report';await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await setDoc(doc(d,'shared',id),{place:place(id),reviews:{},deleted:false,version:1,updated:Timestamp.now(),cell:'183:19'});await setDoc(doc(d,'reports',rid),{uid:'alice',placeId:id,reviewId:'',photoId:'',status:'pending',created:Timestamp.now(),reason:'Fiche incorrecte'});});
  const b=writeBatch(admin);b.update(doc(admin,'shared',id),{place:{...place(id,2),name:'Nom corrigé'},reviews:{},version:2,updated:serverTimestamp(),lastModeration:rid+'_edit',moderationReport:rid});b.update(doc(admin,'reports',rid),{status:'corrected'});await assertSucceeds(b.commit());
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'reports',rid),{status:'pending'}));
  const remove=()=>{const b=writeBatch(admin);b.update(doc(admin,'shared',id),{place:null,reviews:{},deleted:true,version:3,updated:serverTimestamp(),lastModeration:rid+'_remove',moderationReport:rid});b.update(doc(admin,'reports',rid),{status:'removed'});return b.commit();};await assertSucceeds(remove());await assertFails(remove());
 });

 await test('fiche complète signalée : texte corrigé, photos et avis conservés',async()=>{
  const id='moderated-full-place',rid='full-place-report';
  const saved={...place(id),address:'12 rue des Jeux',city:'Lyon',hours:'Mo-Fr 09:00-18:00',description:'À corriger',website:'https://exemple.fr',age:'2–6 ans',access:'public',wheelchair:true,changing_table:false,drinking_water:true,free:true,fenced:false,shade:false,shelter:true,bench:true,condition:'open',photo_count:3};
  const reviews={alice:{...review,place_id:id}};
  await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();await setDoc(doc(d,'shared',id),{place:saved,reviews,deleted:false,version:1,updated:Timestamp.now(),cell:'183:19',kind:'place.create',lastOp:'seed',by:'alice',lastPhoto:''});await setDoc(doc(d,'reports',rid),{uid:'alice',placeId:id,reviewId:'',photoId:'',status:'pending',created:Timestamp.now(),reason:'Texte problématique'});});
  const correction=async (actor,extra={})=>{const b=writeBatch(actor);b.update(doc(actor,'shared',id),{place:{...saved,version:2,description:'Corrigé',...extra},reviews,version:2,updated:serverTimestamp(),lastModeration:rid+'_edit',moderationReport:rid});b.update(doc(actor,'reports',rid),{status:'corrected'});return b.commit();};
  await assertFails(correction(user('bob')));await assertFails(correction(admin,{photo_count:0}));await assertSucceeds(correction(admin));
  const result=(await getDoc(doc(admin,'shared',id))).data();
  if(result.place.photo_count!==3 || result.place.address!==saved.address || result.reviews.alice.text!==review.text)throw Error('Contenu conservé altéré');
  await assertSucceeds(mutate(user('bob'),'bob',id,'place.edit','edit-after-moderation',d=>{d.place.name='Nom ensuite corrigé';}));
 });

 await test('signalements anonymes des lieux importés, re-signalement après décision',async()=>{
  const who=env.authenticatedContext('reporter',{firebase:{sign_in_provider:'anonymous'}}).firestore(),id='imported-no-shared',rid='reporter_'+'a'.repeat(24);
  const data={uid:'reporter',placeId:id,reviewId:'',reason:'Adresse incorrecte',status:'pending',created:serverTimestamp(),placeSnapshot:place(id,0)};
  await assertSucceeds(setDoc(doc(who,'reports',rid),data));await assertFails(updateDoc(doc(who,'reports',rid),{status:'corrected'}));await assertSucceeds(updateDoc(doc(admin,'reports',rid),{status:'dismissed'}));await assertSucceeds(setDoc(doc(who,'reports',rid),data));
  await assertFails(setDoc(doc(who,'reports','reporter_'+'b'.repeat(24)),{...data,placeSnapshot:{...data.placeSnapshot,lat:0}}));
 });
 await test('photo privée signalée, décision limitée et lecture protégée',async()=>{
  const who=env.authenticatedContext('reporter',{firebase:{sign_in_provider:'anonymous'}}).firestore(),id='private-photo-place',rid='reporter_'+'c'.repeat(24);
  const data={uid:'reporter',placeId:id,reviewId:'',photoId:'local-photo',reason:'Visage visible',status:'pending',created:serverTimestamp(),placeSnapshot:place(id,0),photoSnapshot:{id:'local-photo',place_id:id,user_id:'alice',author:'Alice',caption:'',created:'2026-10-02',url:'data:image/webp;base64,YQ=='}};
  await assertSucceeds(setDoc(doc(who,'reports',rid),data));await assertFails(getDoc(doc(user('bob'),'reports',rid)));
  await assertFails(updateDoc(doc(who,'reports',rid),{status:'removed',resolution:{}}));
  await assertFails(updateDoc(doc(admin,'reports',rid),{status:'corrected',resolution:{photoUrl:'https://malicious.invalid'}}));
  await assertSucceeds(updateDoc(doc(admin,'reports',rid),{status:'corrected',resolution:{photoUrl:'data:image/webp;base64,Yg=='}}));
  await assertSucceeds(setDoc(doc(who,'reports',rid),data));await assertSucceeds(updateDoc(doc(admin,'reports',rid),{status:'removed',resolution:{}}));
  await assertSucceeds(getDocs(query(collection(user('alice'),'reports'),where('photoSnapshot.user_id','==','alice'),where('status','in',['removed','corrected']),limit(5))));
 });
 await test('avis privé signalé et corrigé, champs étrangers refusés',async()=>{
  const who=env.authenticatedContext('reporter',{firebase:{sign_in_provider:'anonymous'}}).firestore(),id='private-review-place',rid='reporter_'+'d'.repeat(24);
  const data={uid:'reporter',placeId:id,reviewId:'local-review',reason:'Texte incorrect',status:'pending',created:serverTimestamp(),placeSnapshot:place(id,0),reviewSnapshot:{...review,id:'local-review',place_id:id}};
  await assertSucceeds(setDoc(doc(who,'reports',rid),data));await assertFails(updateDoc(doc(admin,'reports',rid),{status:'corrected',resolution:{text:'Corrigé',stars:5}}));await assertSucceeds(updateDoc(doc(admin,'reports',rid),{status:'corrected',resolution:{text:'Corrigé'}}));
 });
 await test('lieu importé modéré atomiquement avec compteur, création réservée à admin',async()=>{
  for(const remove of [false,true]){
   const id=remove?'imported-delete':'imported-edit',rid=remove?'imported-delete-report':'imported-edit-report';
   await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'reports',rid),{uid:'alice',placeId:id,reviewId:'',placeSnapshot:place(id,0),reason:'Erreur',status:'pending',created:Timestamp.now()}));
   const operation=async actor=>{const old=(await getDoc(doc(actor,'system','budget'))).data(),b=writeBatch(actor);b.set(doc(actor,'shared',id),{place:remove?null:{...place(id,1),name:'Nom corrigé'},reviews:{},deleted:remove,version:1,cell:'183:19',kind:'moderation',by:actor===admin?'owner':'bob',lastOp:'seed',lastPhoto:'',moderationReport:rid,lastModeration:'unique',updated:serverTimestamp()});b.update(doc(actor,'reports',rid),{status:remove?'removed':'corrected'});b.update(doc(actor,'system','budget'),{places:old.places+1,lastType:'moderation-place',lastId:id});return b.commit();};
   await assertFails(operation(user('bob')));await assertSucceeds(operation(admin));
  }
 });
 await assertSucceeds(getDoc(doc(admin,'admin','access')));
 await assertFails(getDoc(doc(user('bob'),'admin','access')));
 await assertFails(getDoc(doc(user('unverified',false),'admin','access')));
 console.log(`${count} scénarios de règles et 3 contrôles d’accès administrateur validés.`);
}finally{await env.cleanup()}
