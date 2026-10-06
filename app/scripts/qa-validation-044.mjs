import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {doc,setDoc,getDoc,Timestamp,updateDoc} from 'firebase/firestore';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('../firestore.rules','utf8')}});
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('../livraison/apercus-0.1.44',{recursive:true});
const place={id:'qa-place-044',version:1,name:'Jeux enregistrés',category:'playground',lat:45.75,lon:4.83,address:'12 rue des Jeux',city:'Lyon',hours:'Mo-Fr 09:00-18:00',description:'Texte problématique',website:'https://exemple.fr',age:'2–6 ans',access:'public',wheelchair:true,changing_table:false,drinking_water:true,free:true,fenced:false,elevator:null,bench:true,shade:false,shelter:true,condition:'open',sources:[],rating:null,review_count:0,community:true,photo_count:1};
try {
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'system','budget'),{members:100,places:100,previews:100,lastType:'',lastId:''}));
 const page=await browser.newPage({viewport:{width:412,height:915}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('Browser error',e.message);});
  await page.addInitScript(()=>localStorage.setItem('map-offline','true'));
 await page.goto('http://127.0.0.1:5189/');await page.waitForFunction(()=>!!window.qa);
 await page.evaluate(async()=>{
  const c=window.qa.cloud;try {await c.registerFreeAccount('validation044@example.org','Cailloute-Test-2026!','ValidationQA'+Date.now(),true);}catch(e){if(!String(e).includes('email-already-in-use'))throw e;await c.loginFreeAccount('validation044@example.org','Cailloute-Test-2026!');}
 });
 if(!(await page.evaluate(()=>window.qa.cloud.getFreeSession().verified))){const data=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-cailloute-free/oobCodes')).json();const code=data.oobCodes.findLast(c=>c.email==='validation044@example.org'&&c.requestType==='VERIFY_EMAIL');await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oobCode:code.oobCode})});}
 await page.evaluate(async()=>{const c=window.qa.cloud;await c.reloadFreeSession();if(!c.getFreeSession().termsAccepted)await c.acceptFreeTerms('ValidationQA'+Date.now(),true);await window.qa.store.db.meta.delete(window.qa.budget.BUDGET_KEY);});
 const photoUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=200;return c.toDataURL('image/webp');});
 assert.equal(await page.evaluate(()=>window.qa.cloud.getFreeSession().isAdmin),false);
 const uid=await page.evaluate(()=>window.qa.cloud.getFreeSession().uid);

 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'shared',place.id),{place,reviews:{},deleted:false,version:1,updated:Timestamp.now(),cell:'183:19',lastOp:'seed',by:'someone',kind:'place.create',lastPhoto:''}));
 await page.evaluate(async place=>{
  const q=window.qa;await q.sync.applyFreeChanges([{id:place.id,place,reviews:[],deleted:false,updated:Date.now()}]);
  q.show(place);
 },place);
 await page.locator('.accuracy-button').waitFor();
 await page.evaluate(async()=>{const q=window.qa;await q.store.db.meta.delete(q.budget.BUDGET_KEY);await q.budget.reserveReads(50);localStorage.setItem('map-offline','false');});
 await page.locator('.accuracy-button').click();await page.waitForTimeout(500);await page.getByRole('button',{name:'Informations exactes',exact:true}).click();
 await page.waitForTimeout(700);
 const state=await page.evaluate(async id=>({personal:await window.qa.store.db.personal.get(id),queue:await window.qa.store.db.freeQueue.toArray(),errors:[...document.querySelectorAll('.error')].map(n=>n.textContent),budget:await window.qa.budget.automaticReadsLeft()}),place.id);

 assert.deepEqual(state.errors,[],'La validation est bloquée par le quota automatique');
 await page.getByRole('dialog',{name:'Exactitude des informations',exact:true}).waitFor({state:'hidden'});
 await page.evaluate(()=>window.qa.sync.runFreeSync());
 const stored=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data();assert.equal(stored.place.information_validated,true);
 assert.equal(await page.evaluate(()=>window.qa.budget.automaticReadsLeft()),0);
 assert(Number.isFinite(Date.parse(stored.place.validated_at)));assert.equal(stored.place.validation_changed_at,stored.place.validated_at);
 for(const [key,value] of Object.entries(place))if(key!=='version')assert.deepEqual(stored.place[key],value,`Champ altéré : ${key}`);
 assert.equal(await page.evaluate(()=>window.qa.toast),'Informations validées.');
 await page.locator('.accuracy-button').click();await page.getByRole('button',{name:'À corriger',exact:true}).click();
 await page.getByRole('dialog',{name:'Exactitude des informations',exact:true}).waitFor({state:'hidden'});await page.waitForTimeout(300);await page.evaluate(()=>window.qa.sync.runFreeSync());
 const corrected=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data();assert.equal(corrected.place.information_validated,false);assert.equal(corrected.place.validated_at,stored.place.validated_at);
 await page.evaluate(()=>localStorage.setItem('map-offline','true'));await page.locator('.accuracy-button').click();await page.getByRole('button',{name:'Informations exactes',exact:true}).click();
 await page.getByRole('dialog',{name:'Exactitude des informations',exact:true}).waitFor({state:'hidden'});
 const offline=await page.evaluate(async id=>({place:await window.qa.store.getDetail(id),queue:await window.qa.store.db.freeQueue.toArray()}),place.id);assert.equal(offline.place.information_validated,true);assert.equal(offline.queue.length,1);
 assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data().place.information_validated,false);
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');await window.qa.sync.runFreeSync();});
 assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data().place.information_validated,true);
 // Les observateurs démarrent après l’enregistrement effectif ; leur quota ne peut plus annuler l’écriture.
 await page.evaluate(async()=>{
  const q=window.qa,{db,notify}=q.store;let events=0;const listener=()=>{events++;void q.budget.reserveReads(3).catch(()=>{});};window.addEventListener('cailloute',listener);
  try {
   await db.transaction('rw',db.meta,()=>db.meta.put({key:'qa-commit-044',value:true}).then(()=>db.transaction('rw',db.meta,()=>{notify();notify();return db.meta.put({key:'qa-nested-044',value:true});})).then(()=>{if(events!==0)throw Error('Actualisation avant la fin de l’écriture');}));
   if(events!==1||!(await db.meta.get('qa-commit-044')))throw Error('Notification de fin de transaction incorrecte');
   events=0;
   try{await db.transaction('rw',db.meta,()=>db.meta.put({key:'qa-abort-044',value:true}).then(()=>{notify();throw Error('Annulation attendue');}));throw Error('Transaction non annulée');}catch(e){if(e.message!=='Annulation attendue')throw e;}
   if(events!==0||await db.meta.get('qa-abort-044'))throw Error('Une écriture annulée a été signalée comme enregistrée');
  }finally{window.removeEventListener('cailloute',listener);}
 });
 assert.equal(await page.evaluate(()=>window.qa.budget.automaticReadsLeft()),0);assert.deepEqual(errors,[]);
 await page.screenshot({path:'../livraison/apercus-0.1.44/validation.png'});
 const result={compiledInterface:true,automaticBudgetExhausted:true,validationSent:true,correctionSent:true,validationDateShared:true,offlineValidationRetainedAndSent:true,notificationsAfterCommit:true,rollbackDoesNotNotify:true,automaticBudgetUnchanged:true,errors};writeFileSync('../livraison/apercus-0.1.44/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await browser.close();await env.cleanup();}
