import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {enrichmentServer} from './open-enrichment-server.mjs';
import {publishPlan} from './publish-open-photos.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {initializeTestEnvironment}=await import(require.resolve('@firebase/rules-unit-testing'));
const {doc,setDoc,getDoc,Timestamp}=await import(require.resolve('firebase/firestore'));
const folder=process.env.CAILLOUTE_OPEN_FOLDER||resolve(root,'donnees/enrichissement-ouvert'),out=resolve(root,'livraison/apercus-enrichissement');
await mkdir(out,{recursive:true});
const data=JSON.parse(await readFile(resolve(folder,'candidates.json'),'utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const server=await enrichmentServer(folder,5193,true);
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:await readFile(resolve(root,'firestore.rules'),'utf8')}});
try {
 const context=await browser.newContext({viewport:{width:1280,height:950},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const remote=[];page.on('request',req=>{if(!['127.0.0.1','localhost'].includes(new URL(req.url()).hostname))remote.push(req.url());});
 await page.goto('http://127.0.0.1:5193/exemple-enrichissement.html');
 await page.getByRole('heading',{name:'Enrichissement à valider'}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.review-cards article').length===30);
 assert(await page.getByRole('button',{name:'Exporter le lot validé'}).isDisabled());
 await page.getByRole('checkbox',{name:'Avec une photo prête'}).check();
 assert.equal(await page.locator('.review-photo').count(),Math.min(30,data.candidates.filter(c=>c.photo?.finalFile).length));
 await page.locator('.review-photo img').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.review-photo img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:resolve(out,'photos-nuit.png'),fullPage:true});
 await page.getByRole('button',{name:'Mode jour'}).click();await page.screenshot({path:resolve(out,'photos-jour.png'),fullPage:true});
 await page.setViewportSize({width:412,height:915});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Débordement mobile');
 await page.screenshot({path:resolve(out,'mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'Vérifier / modifier le floutage'}).first().click();
 await page.getByRole('dialog').waitFor();await page.locator('.privacy-image canvas').waitFor();
 await page.waitForFunction(()=>document.querySelector('.privacy-toolbar button')&&!document.querySelector('.privacy-toolbar button').disabled);
 assert(await page.getByRole('dialog').count());
 await page.getByRole('button',{name:'Masquer une zone',exact:true}).click();
 const canvas=await page.locator('.privacy-image canvas').boundingBox();
 await page.mouse.move(canvas.x+canvas.width*.2,canvas.y+canvas.height*.2);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.35,canvas.y+canvas.height*.4,{steps:4});await page.mouse.up();
 await page.getByRole('button',{name:'Enregistrer la photo',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(await page.getByRole('button',{name:/Gemini/}).count(),0);
 assert.deepEqual(remote,[],'La prévisualisation a appelé un service distant');
 // Une connexion et des publications exclusivement dans les émulateurs.
 await page.addScriptTag({type:'module',url:'/scripts/qa-open-entry.mjs'});
 await page.waitForFunction(()=>!!window.qa);
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'system','budget'),{members:100,places:100,previews:100,lastType:'',lastId:''}));
 const email='admin-secondaire@example.invalid';
 await page.evaluate(async email=>{const c=window.qa.cloud;try{await c.registerFreeAccount(email,'Cailloute-Test-2026!','ImportQA'+Date.now(),true);}catch(error){if(!String(error).includes('email-already-in-use'))throw error;await c.loginFreeAccount(email,'Cailloute-Test-2026!');}},email);
 if(!(await page.evaluate(()=>window.qa.cloud.getFreeSession().verified))){const codes=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-cailloute-free/oobCodes')).json();const code=codes.oobCodes.findLast(c=>c.email===email&&c.requestType==='VERIFY_EMAIL');await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oobCode:code.oobCode})});}
 await page.evaluate(async()=>{await window.qa.cloud.reloadFreeSession();if(!window.qa.cloud.getFreeSession().termsAccepted)await window.qa.cloud.acceptFreeTerms('ImportQA'+Date.now(),true);localStorage.setItem('map-offline','true');});
 assert(await page.evaluate(()=>window.qa.cloud.getFreeSession().isAdmin));
 const samples=data.candidates.filter(c=>c.photo?.finalFile).slice(0,2);
 const runId=Date.now();
 const plan={schema:1,approved:true,approvedAt:new Date().toISOString(),candidates:[]};
 await page.evaluate(async()=>{await window.qa.store.db.meta.clear();await window.qa.store.db.freeQueue.clear();});
 for(const [index,row] of samples.entries()){
  const place={...row.place,id:`qa-open-photo-${runId}-${index}`,version:1,community:true,photo_count:0,sources:[]};delete place.catalog_sources;delete place.catalog_version;delete place.catalog_group;
  const bytes=await readFile(resolve(folder,row.photo.finalFile));
  plan.candidates.push({place,photo:{url:'data:image/webp;base64,'+bytes.toString('base64'),caption:row.photo.caption,sourceUrl:row.photo.sourceUrl,license:row.photo.license,author:row.photo.author,privacyReviewed:true}});
  const recorded={...place,name:'Nom corrigé par la communauté',hours:'Mo-Fr 10:00-18:00',website:'https://community.example/',description:'Information à préserver'};
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'shared',place.id),{place:recorded,reviews:{},deleted:false,version:1,updated:Timestamp.now(),cell:`${Math.floor(place.lat*4)}:${Math.floor(place.lon*4)}`,lastOp:'seed',by:'someone',kind:'place.create',lastPhoto:''}));
  await page.evaluate(async place=>{await window.qa.store.db.places.put(place);await window.qa.store.db.personal.delete(place.id);await window.qa.store.db.meta.put({key:`free-version:${place.id}`,value:1});},place);
 }
 await page.evaluate(()=>{const node=document.body.appendChild(document.createElement('div'));window.qa.importRoot=window.qa.createRoot(node);window.qa.importRoot.render(window.qa.React.createElement(window.qa.importer.OpenPhotoImport,{onClose:()=>{}}));});
 await page.getByRole('dialog',{name:'Importer des photos libres'}).waitFor();
 await page.locator('input[type=file]').setInputFiles({name:'qa-lot-valide.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});
 await page.getByRole('checkbox',{name:/Je confirme les lieux/}).check();await page.getByRole('button',{name:'Importer le lot',exact:true}).click();
 try{await page.getByText(/2 photo\(s\) préparée\(s\)/).waitFor({timeout:15000});}catch(error){console.log(await page.getByRole('dialog').innerText());throw error;}
 assert.equal(await page.evaluate(()=>window.qa.store.db.freeQueue.count()),2);
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');await window.qa.sync.runFreeSync();});
 assert.equal(await page.evaluate(()=>window.qa.store.db.freeQueue.count()),0);
 for(const item of plan.candidates){const current=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',item.place.id))).data();assert.equal(current.place.name,'Nom corrigé par la communauté');assert.equal(current.place.website,'https://community.example/');assert.equal(current.place.hours,'Mo-Fr 10:00-18:00');assert.equal(current.place.description,'Information à préserver');assert.equal(current.place.photo_count,1);}
 await page.getByRole('checkbox',{name:/Je confirme les lieux/}).check();await page.getByRole('button',{name:'Importer le lot',exact:true}).click();await page.getByText(/0 photo\(s\) préparée\(s\), 2 déjà importée\(s\)/).waitFor();
 assert.equal(await page.evaluate(()=>window.qa.store.db.freeQueue.count()),0);
 for(const item of plan.candidates)assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',item.place.id))).data().version,2);
 const detail=await page.evaluate(async id=>{await window.qa.sync.cacheFreePreviews(id,true);return window.qa.store.getDetail(id);},plan.candidates[0].place.id);
 assert.equal(detail.photos[0].caption,plan.candidates[0].photo.caption);
 await page.evaluate(detail=>{window.qa.importRoot.unmount();const node=document.body.appendChild(document.createElement('div'));window.qa.detailRoot=window.qa.createRoot(node);window.qa.detailRoot.render(window.qa.React.createElement(window.qa.Detail,{place:detail,aerial:false,origin:{lat:detail.lat,lon:detail.lon,label:'Test',chosen:true},pmr:false,onClose:()=>{},onShowMap:()=>{},onLogin:()=>{},toast:()=>{}}));},detail);
 await page.locator('.featured-photos .photo-credit').waitFor();
 const tile=await page.locator('.featured-photos .photo-tile').first().boundingBox(),flag=await page.locator('.featured-photos .photo-report').first().boundingBox(),trash=await page.locator('.featured-photos .photo-delete').first().boundingBox();
 assert(flag.x<tile.x+tile.width/2 && trash.x>tile.x+tile.width/2,'Position des actions de la photo');
 assert(Math.abs(flag.y-trash.y)<2 && flag.y+flag.height<=tile.y+tile.height+2,'Actions déplacées dans les crédits');
 await page.screenshot({path:resolve(out,'fiche-photo.png')});
 // Signalement avec crédit intact, puis suppression par un contributeur.
 const photo=detail.photos[0];
 const memberEmail=`open-community-${Date.now()}@example.org`;
 await page.evaluate(async email=>{const c=window.qa.cloud;try{await c.registerFreeAccount(email,'Cailloute-Test-2026!','CommunauteQA'+Date.now(),true);}catch(error){if(!String(error).includes('email-already-in-use'))throw error;await c.loginFreeAccount(email,'Cailloute-Test-2026!');}},memberEmail);
 if(!(await page.evaluate(()=>window.qa.cloud.getFreeSession().verified))){const codes=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-cailloute-free/oobCodes')).json();const code=codes.oobCodes.findLast(c=>c.email===memberEmail&&c.requestType==='VERIFY_EMAIL');await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oobCode:code.oobCode})});}
 await page.evaluate(async()=>{await window.qa.cloud.reloadFreeSession();if(!window.qa.cloud.getFreeSession().termsAccepted)await window.qa.cloud.acceptFreeTerms('CommunauteQA'+Date.now(),true);});
 assert.equal(await page.evaluate(()=>window.qa.cloud.getFreeSession().isAdmin),false);
 const report=await page.evaluate(async ({detail,photo})=>window.qa.cloud.reportFreeReview(detail.id,'','Photo à vérifier',photo.id,{place:detail,photo}),{detail,photo});assert(report);
 await page.evaluate(async ({id,photoId})=>{await window.qa.store.enqueue('photo.delete',id,{photo_id:photoId});await window.qa.sync.runFreeSync();},{id:detail.id,photoId:photo.id});
 assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'previews',photo.id))).exists(),false);
 // L'import automatique du catalogue conserve les corrections et reste modérable.
 const published=await publishPlan(plan,{publish:true,emulator:true,reportPath:resolve(out,'publication-test.json')});
 assert.equal(published.published,2);
 const replay=await publishPlan(plan,{publish:true,emulator:true,reportPath:resolve(out,'publication-test.json')});assert.equal(replay.skipped['already-imported'],2);
 const importedId=`${detail.id}_open_${plan.candidates[0].photo.caption.match(/^@commons:(\d+)/)[1]}`;
 const imported=await page.evaluate(async({id,photoId})=>window.qa.cloud.getFreeReportedPlace(id,photoId),{id:detail.id,photoId:importedId});
 await page.evaluate(async current=>window.qa.sync.applyFreeChanges([current]),imported);
 assert(imported.savedPhoto);assert.equal(imported.place.description,'Information à préserver');assert.equal(imported.savedPhoto.caption,plan.candidates[0].photo.caption);
 const importedReport=await page.evaluate(async({current,id})=>window.qa.cloud.reportFreeReview(current.id,'','Photo du catalogue à vérifier',id,{place:current.place,photo:current.savedPhoto}),{current:imported,id:importedId});assert(importedReport);
 await page.evaluate(async ({id,photoId})=>{await window.qa.store.enqueue('photo.delete',id,{photo_id:photoId});await window.qa.sync.runFreeSync();},{id:detail.id,photoId:importedId});
 assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'previews',importedId))).exists(),false);
 const deletedReplay=await publishPlan(plan,{publish:true,emulator:true,reportPath:resolve(out,'publication-test.json')});assert.equal(deletedReplay.published,0);assert.equal(deletedReplay.skipped['already-imported'],2);
 assert.equal((await getDoc(doc(env.unauthenticatedContext().firestore(),'previews',importedId))).exists(),false,'Une photo supprimée a été réimportée');
 assert.deepEqual(errors,[]);
 const result={catalogPendingApproval:true,photos:data.candidates.filter(c=>c.photo?.finalFile).length,maxPhotoBytes:Math.max(...samples.map(c=>c.photo.bytes)),previewRemoteCalls:0,darkAndLight:true,mobileNoOverflow:true,privacyEditor:true,noGeminiButton:true,emulatorOnly:true,regularPhotoImport:true,reimportWithoutDuplicate:true,existingCorrectionsPreserved:true,creditsPreserved:true,reportAccepted:true,ordinaryContributorPhotoDeletion:true,automaticCatalogPublication:true,deletedPhotoNeverReimported:true,errors};
 await writeFile(resolve(out,'tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
} finally {await browser.close();await server.close();await env.cleanup();}
