// QA sans production : seuls le projet demo et les hôtes locaux sont autorisés.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project='demo-cailloute-free', origin='http://127.0.0.1:5197', password='Cailloute-Test-2026!';
const environment=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8089,rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
const browser=await chromium.launch({channel:'chrome',headless:true});
let count=0;
async function test(name, fn) { await fn(); console.log(`✓ ${name}`); count++; }
async function api(path,body,method=body?'POST':'GET') {
 const response=await fetch('http://127.0.0.1:9099/'+path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json(); if(!response.ok)throw Error(JSON.stringify(result));return result;
}
async function call(page,method,...args){return page.evaluate(({method,args})=>window.qa.cloud[method](...args),{method,args});}
async function evalQa(page,fn,arg){return page.evaluate(async({source,arg})=>{try{return await (0,eval)("("+source+")")(arg);}catch(error){throw new Error(error.name+": "+error.message+"\n"+error.stack);}}, {source:fn.toString(),arg});}
async function session(page,email,name){
 await call(page,'registerFreeAccount',email,password,name,true);
 assert.equal((await call(page,'getFreeSession')).verified,false);
 const codes=await api(`emulator/v1/projects/${project}/oobCodes`);
 const code=codes.oobCodes.findLast(item=>item.email===email&&item.requestType==='VERIFY_EMAIL');assert(code);
 await api('identitytoolkit.googleapis.com/v1/accounts:update?key=fake',{oobCode:code.oobCode});
 await call(page,'reloadFreeSession');
 const user=await call(page,'getFreeSession');assert(user.verified&&user.termsAccepted);return user;
}
async function page(){
 const context=await browser.newContext({ permissions: ["local-network-access"] });
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))throw Error('Réseau non local refusé : '+u.origin);if(u.pathname==='/__free_qa')return route.fulfill({contentType:'text/html',body:'<html><body>QA gratuite locale</body></html>'});await route.continue();});
 const p=await context.newPage();p.on('console',message=>{if(message.type()==='error'&&!message.text().includes('PERMISSION_DENIED')&&!message.text().includes('400 (Bad Request)'))console.log('Navigateur:',message.text())});
 await p.goto(origin+'/__free_qa');
 await p.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.qa={cloud:await import('/src/free-cloud.ts'),store:await import('/src/store.ts'),sync:await import('/src/free-sync.ts'),photo:await import('/src/photo-input.ts')};if(!window.qa.cloud.freeCollaborationEnabled)throw Error('Flag partage absent');});
 return p;
}
async function offline(p){await p.evaluate(()=>Object.defineProperty(navigator,'onLine',{value:false,configurable:true}));}
async function sync(p){await p.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await window.qa.sync.runFreeSync();Object.defineProperty(navigator,'onLine',{value:false,configurable:true});});}
async function shared(id){return (await getDoc(doc(environment.unauthenticatedContext().firestore(),'shared',id))).data();}
const payload={name:'Parc QA',category:'playground',lat:45.75,lon:4.83,address:'Rue de test',city:'Lyon',hours:'',description:'',age:'',access:'',wheelchair:null,changing_table:null,drinking_water:null,free:true,fenced:null,elevator:null};
try {
 await environment.clearFirestore();await api(`emulator/v1/projects/${project}/accounts`,undefined,'DELETE');
 await environment.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'system','budget'),{members:0,places:0,previews:0,lastType:'',lastId:''});await setDoc(doc(ctx.firestore(),'admin','access'),{enabled:true});});
 const alice=await page();const bob=await page();const admin=await page();let a,b;
 await test('anciennes créations privées conservées hors partage après inscription',async()=>{
  await evalQa(alice,async payload=>window.qa.store.saveContribution('private-old',payload,undefined,undefined,[]),{...payload,name:'Ancien lieu privé'});
  a=await session(alice,'alice@example.test','Alice');await sync(alice);assert.equal(await shared('private-old'),undefined);
  assert.equal(await evalQa(alice,()=>window.qa.store.db.freeQueue.count()),0);
 });
 let image;
 await test('nouvelle fiche, avis et trois aperçus : transaction Dexie réelle puis publication',async()=>{
  image=await evalQa(alice,async base64=>{const blob=await(await fetch('data:image/jpeg;base64,'+base64)).blob();return (await window.qa.photo.preparePhoto(blob)).base64;},readFileSync(new URL('../src/test-data/photo-no-gps.jpg',import.meta.url)).toString('base64'));
  await evalQa(alice,async({payload,image})=>window.qa.store.saveContribution('shared-qa',payload,undefined,{stars:4,text:'Très bien'},[{base64:image,caption:'Aperçu1'},{base64:image,caption:'Aperçu2'},{base64:image,caption:'Aperçu3'}]),{payload,image});
  assert.equal(await evalQa(alice,()=>window.qa.store.db.freeQueue.count()),5, JSON.stringify(await call(alice,'getFreeSession')));await sync(alice);
  const queue=await evalQa(alice,()=>window.qa.store.db.freeQueue.toArray());assert.deepEqual(queue,[]);
  const value=await shared('shared-qa');assert.equal(value.place.name,'Parc QA');assert.equal(value.version,5);assert.equal(value.reviews[a.uid].text,'Très bien');
  assert.equal((await call(alice,'fetchFreePreviews','shared-qa')).length,3);
 });
 await test('favoris transférés entre sessions du même compte',async()=>{await call(alice,'saveFreeFavorites',['shared-qa']);assert.deepEqual(await call(alice,'loadFreeFavorites'),['shared-qa']);});
 await test('modification partagée et rejeu idempotent',async()=>{
  await evalQa(alice,payload=>window.qa.store.enqueue('place.edit','shared-qa',payload),{...payload,name:'Parc corrigé'});
  const [item]=await evalQa(alice,()=>window.qa.store.db.freeQueue.toArray());await sync(alice);
  const before=await shared('shared-qa');await call(alice,'pushFreeOperation',item.operation,item.base);const after=await shared('shared-qa');assert.equal(after.version,before.version);assert.equal(after.place.name,'Parc corrigé');
 });
 await test('Bob reçoit les fiches et aperçus sans relecture répétée',async()=>{
  b=await session(bob,'bob@example.test','Bob');await sync(bob);
  assert.equal((await evalQa(bob,()=>window.qa.store.getDetail('shared-qa'))).name,'Parc corrigé');
  await evalQa(bob,async()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await window.qa.sync.cacheFreePreviews('shared-qa');Object.defineProperty(navigator,'onLine',{value:false,configurable:true});});
  const detail=await evalQa(bob,()=>window.qa.store.getDetail('shared-qa'));assert.equal(detail.photos.length,3);
  const before=await evalQa(bob,()=>window.qa.store.db.meta.get('free-preview-budget'));await evalQa(bob,async()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await window.qa.sync.cacheFreePreviews('shared-qa');Object.defineProperty(navigator,'onLine',{value:false,configurable:true});});const after=await evalQa(bob,()=>window.qa.store.db.meta.get('free-preview-budget'));assert.deepEqual(after,before);
 });
 await test('signalement privé puis modération réelle par administrateur',async()=>{
  await call(bob,'reportFreeReview','shared-qa',a.uid,'Commentaire de test à modérer');
  await session(admin,'admin-secondaire@example.invalid','Éditeur');assert.equal((await call(admin,'getFreeSession')).isAdmin,true);
  const reports=await call(admin,'listFreeReports');assert.equal(reports.length,1);await call(admin,'resolveFreeReport',reports[0].id,true);assert.equal(Object.keys((await shared('shared-qa')).reviews).length,0);
 });
 await test('conflit distant conservé localement sans écrasement',async()=>{
  await evalQa(alice,payload=>window.qa.store.enqueue('place.edit','shared-qa',payload),{...payload,name:'Parc corrigé',hours:'10:00-18:00'});await sync(alice);
  const [item]=await evalQa(alice,()=>window.qa.store.db.freeQueue.toArray());assert.equal(item.status,'error');assert.match(item.error,/changé/);assert.equal((await shared('shared-qa')).place.hours,'');
  await evalQa(alice,id=>window.qa.sync.discardFreeOperation(id),item.id);
 });
 await test('suppression locale et file partagée : rollback Dexie complet en cas d’échec',async()=>{
  const before=await evalQa(bob,()=>window.qa.store.db.freeQueue.count());
  const result=await evalQa(bob,async()=>{const db=window.qa.store.db;const original=db.details.bulkDelete;db.details.bulkDelete=async()=>{throw Error('Échec de stockage simulé')};try{await window.qa.store.enqueue('place.delete','shared-qa',{});return false;}catch(error){return error.message.includes('Échec de stockage simulé')}finally{db.details.bulkDelete=original;}});
  assert(result);assert.equal(await evalQa(bob,()=>window.qa.store.db.freeQueue.count()),before);assert(await evalQa(bob,()=>window.qa.store.db.places.get('shared-qa')));assert.equal(await evalQa(bob,()=>window.qa.store.db.removed.get('shared-qa')),undefined);
 });
 await test('file persistante par compte après fermeture de page, sans envoi par un autre compte',async()=>{
  const id=await evalQa(alice,payload=>window.qa.store.enqueue('place.create','alice-pending',payload),{...payload,name:'Alice attente'});
  await call(alice,'logoutFreeAccount');await call(alice,'loginFreeAccount','bob@example.test',password);await sync(alice);assert.equal(await shared('alice-pending'),undefined);
  await alice.reload();await alice.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.qa={cloud:await import('/src/free-cloud.ts'),store:await import('/src/store.ts'),sync:await import('/src/free-sync.ts')};});
  assert.equal((await evalQa(alice,id=>window.qa.store.db.freeQueue.get(id),id)).owner,a.uid);
  await call(alice,'logoutFreeAccount');await call(alice,'loginFreeAccount','alice@example.test',password);await sync(alice);assert.equal((await shared('alice-pending')).place.name,'Alice attente');
 });
 await test('avis et photo privés supprimés sans toucher au contenu partagé',async()=>{
  await call(alice,'logoutFreeAccount');
  const reviewId=await evalQa(alice,()=>window.qa.store.enqueue('review.save','alice-pending',{stars:2,text:'Ancien avis privé'}));
  const photoId=await evalQa(alice,image=>window.qa.store.enqueue('photo.add','alice-pending',{base64:image,caption:'Privée'}),image);
  await call(alice,'loginFreeAccount','alice@example.test',password);
  const saved=await call(alice,'pushFreeOperation',{id:'new-public-review',kind:'review.save',place_id:'alice-pending',base_version:1,payload:{stars:5,text:'Avis partagé'}},undefined);
  await evalQa(alice,saved=>window.qa.sync.applyFreeChanges([saved]),saved);
  await evalQa(alice,reviewId=>window.qa.store.enqueue('review.delete','alice-pending',{review_id:reviewId}),reviewId);
  await evalQa(alice,photoId=>window.qa.store.enqueue('photo.delete','alice-pending',{photo_id:photoId}),photoId);
  assert.equal(await evalQa(alice,()=>window.qa.store.db.freeQueue.count()),0);await sync(alice);assert.equal((await shared('alice-pending')).reviews[a.uid].text,'Avis partagé');
  const detail=await evalQa(alice,()=>window.qa.store.getDetail('alice-pending'));assert.equal(detail.reviews.length,1);assert.equal(detail.photos.length,0);
 });
 await test('déplacement proche accepté ; autre cellule refusée sans déplacement du lieu',async()=>{
  const before=await shared('alice-pending');
  const saved=await call(alice,'pushFreeOperation',{id:'near-move',kind:'place.edit',place_id:'alice-pending',base_version:before.version,payload:{lat:45.76}},undefined);assert.equal(saved.place.lat,45.76);
  await assert.rejects(call(alice,'pushFreeOperation',{id:'far-move',kind:'place.edit',place_id:'alice-pending',base_version:saved.place.version,payload:{lat:46}},undefined),/cellule|zone|déplace|déplacement/i);assert.equal((await shared('alice-pending')).place.lat,45.76);
 });
 await test('limite quotidienne atteinte : opération conservée ; reprise et reçu de 64 identifiants',async()=>{
  await environment.withSecurityRulesDisabled(async ctx=>{const day=new Date();day.setUTCHours(0,0,0,0);await updateDoc(doc(ctx.firestore(),'members',a.uid),{dailyAdded:5,day:Timestamp.fromDate(day),recent:Array.from({length:64},(_,i)=>'receipt-'+i)});});
  await evalQa(alice,payload=>window.qa.store.enqueue('place.create','quota-pending',payload),{...payload,name:'Après quota'});await sync(alice);
  assert.equal(await shared('quota-pending'),undefined);assert.equal(await evalQa(alice,()=>window.qa.store.db.freeQueue.count()),1);
  await environment.withSecurityRulesDisabled(async ctx=>{const day=new Date();day.setUTCHours(0,0,0,0);await updateDoc(doc(ctx.firestore(),'members',a.uid),{day:Timestamp.fromMillis(day.getTime()-86400000)});});
  await evalQa(alice,async()=>{const db=window.qa.store.db;const row=await db.meta.get('free-sync-v1');row.value.pausedUntil=0;row.value.nextAttempt=0;await db.meta.put(row);for(const item of await db.freeQueue.toArray()){item.retryAt=0;await db.freeQueue.put(item);}});await sync(alice);assert.equal((await shared('quota-pending')).place.name,'Après quota');
  await environment.withSecurityRulesDisabled(async ctx=>{const data=(await getDoc(doc(ctx.firestore(),'members',a.uid))).data();assert.equal(data.recent.length,64);assert.equal(data.recent[0],'receipt-1');assert.equal(data.dailyAdded,1);});
 });
 await test('suppression : fiche et cache effacés, toutes les photos inaccessibles',async()=>{
  const change=await call(bob,'getFreeReportedPlace','shared-qa');await evalQa(bob,change=>window.qa.sync.applyFreeChanges([change]),change);
  await evalQa(bob,()=>window.qa.store.enqueue('place.delete','shared-qa',{}));await sync(bob);
  const value=await shared('shared-qa');assert(value.deleted);assert.equal(value.place,null);assert.deepEqual(value.reviews,{});await assert.rejects(call(bob,'fetchFreePreviews','shared-qa'),/permission|permissions|evaluation error/i);
  assert.equal(await evalQa(bob,()=>window.qa.store.db.details.get('shared-qa')),undefined);assert.equal(await evalQa(bob,()=>window.qa.store.db.personal.get('shared-qa')),undefined);assert.deepEqual(await evalQa(bob,()=>window.qa.store.db.freeQueue.toArray()),[]);
 });
 await test('réceptions bornées à 50 lectures et aperçus bornés à 20 accès par appareil',async()=>{
  await environment.withSecurityRulesDisabled(async ctx=>{
   for(let i=0;i<80;i++){const id='budget-'+String(i).padStart(3,'0');await setDoc(doc(ctx.firestore(),'shared',id),{place:{...payload,id,version:1,sources:[],rating:null,review_count:0,photo_count:0,community:true},reviews:{},deleted:false,updated:Timestamp.fromMillis(Date.now()+i),version:1,cell:'183:19',lastOp:'budget',by:a.uid,kind:'place.create'});}
  });
  const reader=await page();const reads=[];const parsed=[];
  reader.on('response',response=>{if(response.url().includes(':runQuery'))parsed.push(response.json().then(rows=>reads.push(Math.max(1,rows.filter(row=>row.document).length))));});
  for(let i=0;i<8;i++)await sync(reader);
  await Promise.all(parsed);const meta=await evalQa(reader,()=>window.qa.store.db.meta.get('free-sync-v1'));assert.equal(meta.value.reads,50);assert.equal(reads.reduce((a,b)=>a+b,0),50);
  const before=reads.length;await sync(reader);assert.equal(reads.length,before);
  let previewReads=0;reader.on('request',request=>{if(request.url().includes(':runQuery') && request.postData()?.includes('previews')) previewReads++;});
  await evalQa(reader,async()=>{const db=window.qa.store.db;for(let i=0;i<12;i++){const id='budget-'+String(i).padStart(3,'0');await db.meta.put({key:'free-version:'+id,value:1});await db.details.put({id,version:1,photos:[],reviews:[]});}Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await Promise.all(Array.from({length:12},(_,i)=>window.qa.sync.cacheFreePreviews('budget-'+String(i).padStart(3,'0'))));Object.defineProperty(navigator,'onLine',{value:false,configurable:true});});
  assert(previewReads>0&&previewReads<=20);assert.equal((await evalQa(reader,()=>window.qa.store.db.meta.get('free-preview-budget'))).value.reads,previewReads);
 });
 await test('un deuxième onglet ne synchronise pas pendant le verrou de l’autre',async()=>{
  const same=await alice.context().newPage();await same.goto(origin+'/__free_qa');await same.evaluate(async()=>{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});window.qa={sync:await import('/src/free-sync.ts')};});
  let requests=0;same.on('request',r=>{if(r.url().includes('8089'))requests++;});
  await alice.evaluate(()=>{window.qa.lockReady=new Promise(resolve=>{void navigator.locks.request('cailloute-free-sync',async()=>{resolve();await new Promise(done=>{window.qa.releaseLock=done;});});});return window.qa.lockReady;});
  await same.evaluate(()=>window.qa.sync.runFreeSync());assert.equal(requests,0);await alice.evaluate(()=>window.qa.releaseLock());await same.close();
 });
 console.log(`${count} parcours E2E réels validés. Aucun accès production.`);
} finally {await browser.close();await environment.cleanup();}
