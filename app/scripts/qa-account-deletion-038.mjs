import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';
import {doc,setDoc,getDoc,Timestamp} from 'firebase/firestore';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('../firestore.rules','utf8')}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'system','budget'),{members:0,places:0,previews:0,lastType:'',lastId:''}));
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5187/suppression-compte');
 const uid=await page.evaluate(async()=>{
  const cloud=await import('/src/free-cloud.ts');await cloud.registerFreeAccount(`qa-${Date.now()}@example.test`,'Password123!','Test suppression',true);return cloud.getFreeSession().uid;
 });
 const review={id:uid,user_id:uid,place_id:'qa-delete',author:'Test suppression',stars:4,text:'Contribution conservée',votes:1,voters:['other'],updated:'2026-10-02'};
 const photo={id:'qa-photo',place_id:'qa-delete',user_id:uid,author:'Test suppression',url:'kept',created:'2026-10-02',caption:'Photo conservée'};
 const place={id:'qa-delete',version:1,name:'Lieu conservé'};
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();await setDoc(doc(d,'shared','qa-delete'),{place,reviews:{[uid]:review},deleted:false,version:1,updated:Timestamp.now()});
  await setDoc(doc(d,'previews','qa-photo'),{...photo,placeId:'qa-delete'});
  await setDoc(doc(d,'contacts',uid),{uid,message:'Demande ancienne',created:Timestamp.now()});
  await setDoc(doc(d,'reports',uid),{uid,placeId:'qa-delete',reviewId:uid,status:'pending',reason:'Test',created:Timestamp.now()});
  await setDoc(doc(d,'members',uid,'favorites','qa-delete'),{id:'qa-delete',value:true,updated:Timestamp.now()});
 });
 await page.evaluate(async({review,photo,place})=>{
  const {db}=await import('/src/store.ts');await db.personal.put({id:place.id,base:place,patch:{},review,photos:[photo],removedReviews:[],removedPhotos:[],updated:'2026-10-02'});
  await (await import('/src/free-cloud.ts')).requestFreeAccountDeletion();
 },{review,photo,place});
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore(),get=(...path)=>getDoc(doc(d,...path));
  for(const path of [['members',uid],['usernames','u_test suppression'],['contacts',uid],['reports',uid],['members',uid,'favorites','qa-delete']])assert.equal((await get(...path)).exists(),false,path.join('/'));
  const saved=(await get('shared','qa-delete')).data();assert.equal(saved.reviews[uid].author,'Compte supprimé');assert.equal(saved.reviews[uid].text,review.text);assert.deepEqual(saved.reviews[uid].voters,['other']);assert.equal(saved.place.name,place.name);
  assert.equal((await get('previews','qa-photo')).data().author,'Compte supprimé');assert.equal((await get('system','budget')).data().members,0);
 });
 const accounts=await(await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-cailloute-free/accounts:batchGet',{headers:{Authorization:'Bearer owner'}})).json();assert(!accounts.error,JSON.stringify(accounts));assert.equal((accounts.users||[]).some(u=>u.localId===uid),false);
 const local=await page.evaluate(async()=>{const {db}=await import('/src/store.ts');return {item:await db.personal.get('qa-delete'),session:(await import('/src/free-cloud.ts')).getFreeSession()}});
 assert.equal(local.session,null);assert.equal(local.item.review.author,'Compte supprimé');assert.equal(local.item.photos[0].author,'Compte supprimé');
 console.log('Suppression réelle sans admin validée : Authentication, profil, pseudo, favoris et messages supprimés ; avis, photos et votes conservés.');
} finally {await browser.close();await env.cleanup();}
