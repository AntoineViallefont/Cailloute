import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {doc,setDoc,deleteDoc,Timestamp} from 'firebase/firestore';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('../firestore.rules','utf8')}});
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('../livraison/apercus-0.1.42',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:412,height:915}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('map-offline','true'));
 await page.goto('http://127.0.0.1:5187/suppression-compte');
 await page.evaluate(async()=>{localStorage.setItem('map-offline','true');window.qa={cloud:await import('/src/free-cloud.ts'),store:await import('/src/store.ts'),budget:await import('/src/cloud-budget.ts'),sync:await import('/src/free-sync.ts')};});
 const place={id:'qa-economy',version:1,name:'Jeux économie',category:'playground',lat:45.75,lon:4.83,address:'',city:'Lyon',hours:'',description:'',age:'2–6 ans',access:'unknown',wheelchair:null,changing_table:null,drinking_water:null,free:null,fenced:null,elevator:null,sources:[],rating:null,review_count:0,community:true,photo_count:7};
 const url=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=200;return c.toDataURL('image/webp');});
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'system','budget'),{members:100,places:100,previews:100,lastType:'',lastId:''});await setDoc(doc(db,'shared',place.id),{place,reviews:{},deleted:false,version:1,updated:Timestamp.now(),cell:'183:19',lastOp:'seed',by:'someone',kind:'place.create',lastPhoto:''});for(let i=0;i<7;i++)await setDoc(doc(db,'previews',`${place.id}_${i}`),{placeId:place.id,user_id:'someone',author:'Contributeur',url,caption:'',privacy_reviewed:true,rights_accepted:true,created:Timestamp.now(),lastOp:`photo-${i}`});});
 const result=await page.evaluate(async place=>{
  const {db}=window.qa.store,{cacheFreePreviews}=window.qa.sync;
  await db.meta.delete(window.qa.budget.BUDGET_KEY);await db.places.put(place);await db.meta.put({key:`free-version:${place.id}`,value:1});localStorage.setItem('map-offline','false');
  await cacheFreePreviews(place.id);let detail=await db.details.get(place.id);
  if(detail.photos.length!==3 || detail.photo_count!==7)throw Error(`Premier lot incorrect ${detail.photos.length}/${detail.photo_count}`);
  const used=(await db.meta.get(window.qa.budget.BUDGET_KEY)).value;await cacheFreePreviews(place.id);const repeat=(await db.meta.get(window.qa.budget.BUDGET_KEY)).value;if(JSON.stringify(used)!==JSON.stringify(repeat))throw Error('Relecture inutile');
  await cacheFreePreviews(place.id,true);detail=await db.details.get(place.id);if(detail.photos.length!==6)throw Error('Deuxième lot incorrect');
  await cacheFreePreviews(place.id,true);detail=await db.details.get(place.id);if(detail.photos.length!==7 || (await db.meta.get(`free-preview-page:${place.id}`)).value.hasMore)throw Error('Fin de pagination incorrecte');
  const beforeEdit=(await db.meta.get(window.qa.budget.BUDGET_KEY)).value;
  await window.qa.sync.applyFreeChanges([{id:place.id,place:{...place,name:'Nom corrigé',version:2},reviews:[],deleted:false,updated:Date.now()}]);
  await cacheFreePreviews(place.id);if(JSON.stringify(beforeEdit)!==JSON.stringify((await db.meta.get(window.qa.budget.BUDGET_KEY)).value))throw Error('Nom modifié : photos inutilement rechargées');
  return {first:3,second:6,total:7,firstReads:used.automatic,cacheNoExtraReads:true,nameChangeKeepsPhotoCache:true};
 },place);assert.equal(result.firstReads,5);
 await page.evaluate(async()=>{const c=window.qa.cloud;try{await c.registerFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!','AdminQA'+Date.now(),true);}catch(e){if(!String(e).includes('email-already-in-use'))throw e;await c.loginFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!');}await c.acceptFreeTerms("AdminQA"+Date.now(),true);await c.reloadFreeSession();});
 const uid=await page.evaluate(()=>window.qa.cloud.getFreeSession().uid);
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await deleteDoc(doc(db,'members',uid,'favorites','manual'));for(const [id,value]of [['first',true],['second',true],['removed',false]])await setDoc(doc(db,'members',uid,'favorites',id),{id,value,updated:Timestamp.fromMillis(1000)});});
 const favorites=await page.evaluate(async()=>{
  const c=window.qa.cloud,b=window.qa.budget,{db}=window.qa.store;await db.meta.delete(b.BUDGET_KEY);
  const one=await c.loadFreeFavoriteChanges(null,2),two=await c.loadFreeFavoriteChanges(one.cursor,2);if(one.changes.length!==2 || two.changes.length!==1)throw Error('Pagination des favoris incorrecte');
  if(![...one.changes,...two.changes].some(x=>x.id==='removed'&&!x.value))throw Error('Retrait de favori perdu');
  await b.reserveReads(await b.automaticReadsLeft());try{await c.loadFreeFavoriteChanges(two.cursor,2);throw Error('Quota ignoré');}catch(e){if(!b.isAutomaticReadLimit(e))throw e;}
  await c.setFreeFavorite('manual',true);return {deltaPages:[one.changes.length,two.changes.length],automaticStopped:true,manualWriteWorks:true};
 });
 const profile=await page.evaluate(async()=>{const c=window.qa.cloud,{db}=window.qa.store;const key=`member-cache:${c.getFreeSession().uid}`;if(!(await db.meta.get(key)))throw Error('Profil absent du cache');const before=(await db.meta.get(window.qa.budget.BUDGET_KEY)).value;await c.logoutFreeAccount();await c.loginFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!');if(!c.getFreeSession()?.termsAccepted)throw Error('Profil mis en défaut par le budget');return {cachedSessionWorks:true};});
 // Les signalements s’actualisent directement dans le panneau. Après fermeture, le compteur reste stable.
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');const rm=await import('/node_modules/.vite/deps/react.js'),React=rm.default||rm,cm=await import('/node_modules/.vite/deps/react-dom_client.js'),{FreeModeration}=await import('/src/FreeModeration.tsx');window.qa.root=(cm.createRoot||cm.default.createRoot)(document.body.appendChild(document.createElement('div')));window.qa.root.render(React.createElement(FreeModeration,{onClose:()=>{}}));});
 await page.getByRole('heading',{name:'Signalements et messages',exact:true}).waitFor();await page.waitForTimeout(700);
 const seedReport=async id=>env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'reports',id),{uid:'someone',placeId:place.id,reviewId:'',reason:id,status:'pending',created:Timestamp.now()}));
 await seedReport('live-economy-open');await page.locator('article.reported-content').filter({hasText:'live-economy-open'}).waitFor();
 await page.screenshot({path:'../livraison/apercus-0.1.42/moderation-economy.png'});
 await page.evaluate(()=>window.qa.root.unmount());await page.waitForTimeout(200);
 const before=await page.evaluate(async()=>(await window.qa.store.db.meta.get(window.qa.budget.BUDGET_KEY)).value);
 await seedReport('live-economy-closed');await page.waitForTimeout(500);
 const after=await page.evaluate(async()=>(await window.qa.store.db.meta.get(window.qa.budget.BUDGET_KEY)).value);assert.deepEqual(after,before);
 const report={photos:result,favorites,profile,moderationClosedStopsReads:true,uiErrors:errors};writeFileSync('../livraison/apercus-0.1.42/economy-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await env.cleanup();}
