import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {initializeTestEnvironment}=await import(require.resolve('@firebase/rules-unit-testing'));
const {doc,setDoc,Timestamp}=await import(require.resolve('firebase/firestore'));
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:await readFile(resolve(root,'firestore.rules'),'utf8')}});
// Les émulateurs se trouvent sur d'autres ports loopback ; autorisation limitée au navigateur de QA.
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
const output=resolve(root,'livraison/apercus-0.1.46');await mkdir(output,{recursive:true});
const report={project:'demo-cailloute-free',productionCalls:0,errors:[]};
try{
 const page=await browser.newPage({viewport:{width:412,height:915}});
 const remote=[];page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error')console.error('Console QA',msg.text().slice(0,500));});
 page.on('requestfailed',r=>{const u=new URL(r.url());console.error('Échec réseau QA',u.origin+u.pathname,r.failure()?.errorText);});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(!['127.0.0.1','localhost'].includes(u.hostname)){remote.push(u.origin);return route.abort();}
  if(u.pathname==='/__admin_qa')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="map-root" style="height:600px"></div></body></html>'});
  return route.continue();
 });
 await page.goto('http://127.0.0.1:5194/__admin_qa');
 await page.evaluate(async()=>{
  window.qa={cloud:await import('/src/free-cloud.ts'),store:await import('/src/store.ts'),sync:await import('/src/free-sync.ts'),budget:await import('/src/cloud-budget.ts')};
  localStorage.setItem('origin',JSON.stringify({lat:45.7578,lon:4.832}));
  try{await window.qa.cloud.loginFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!');}
  catch(error){if(!/invalid-credential|user-not-found/.test(String(error)))throw error;await window.qa.cloud.registerFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!','SyncQA'+Date.now(),true);}
 });
 if(!await page.evaluate(()=>window.qa.cloud.getFreeSession()?.verified)){
  const codes=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-cailloute-free/oobCodes')).json();
  const code=codes.oobCodes.findLast(c=>c.email==='admin-secondaire@example.invalid'&&c.requestType==='VERIFY_EMAIL');
  assert(code,'Code de vérification de test absent');
  await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oobCode:code.oobCode})});
 }
 await page.evaluate(()=>window.qa.cloud.reloadFreeSession());
 assert(await page.evaluate(()=>window.qa.cloud.getFreeSession()?.isAdmin),'Le compte de test doit être administrateur vérifié');
 const id='qa-live-'+Date.now();
 const place={id,version:1,name:'Point eau test',category:'water',lat:45.7578,lon:4.832,address:'',city:'Lyon',hours:'',description:'',age:'',access:'',wheelchair:null,changing_table:null,drinking_water:true,free:null,fenced:null,elevator:null,sources:[],rating:null,review_count:0,community:true,photo_count:0};
 const shared=(version,count)=>({place:{...place,version,photo_count:count},reviews:{},deleted:false,version,updated:Timestamp.now(),cell:'183:19',lastOp:'qa-seed-'+version,by:'someone',kind:version===1?'place.create':'photo.add',lastPhoto:version===1?'':id+'_external'});
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'shared',id),shared(1,0)));
 await page.evaluate(async place=>{
  const {store,budget,sync}=window.qa;await store.db.places.put(place);
  await budget.reserveReads(50,'manual');
  await store.db.meta.put({key:'free-sync-v1',value:{day:Date.now(),reads:50,last:Date.now()-86400000,pausedUntil:0,nextAttempt:0,failures:0,zones:{'183:19':{cursor:null,next:Date.now()+86400000,visited:Date.now()}}}});
  await sync.cacheFreePreviews(place.id);window.qa.stop=sync.watchAdminDetail(place.id);await sync.runFreeSync();
 },place);
 const files=await readdir(resolve(root,'donnees/enrichissement-ouvert/photos'));
 const photo=await readFile(resolve(root,'donnees/enrichissement-ouvert/photos',files.find(f=>f.endsWith('.webp'))));
 const url='data:image/webp;base64,'+photo.toString('base64');
 const uid=await page.evaluate(()=>window.qa.cloud.getFreeSession().uid);
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'previews',id+'_external'),{placeId:id,user_id:uid,author:'SyncQA',url,caption:'',privacy_reviewed:true,rights_accepted:true,created:Timestamp.now(),lastOp:'qa-external'});
  await setDoc(doc(ctx.firestore(),'shared',id),shared(2,1));
 });
 await page.waitForFunction(id=>window.qa.store.db.details.get(id).then(d=>d?.photos.some(p=>p.id===id+'_external')),id,{timeout:10000});
 report.adminPhotoReceivedAfterEmptyCache=true;
 report.adminReadsAfterLocalLimit=await page.evaluate(async()=>await window.qa.budget.automaticReadsLeft()===0 && await window.qa.cloud.freeReadsLeft()===Infinity);
 await page.evaluate(async({place,url})=>{await window.qa.store.addPhotos(place.id,[{base64:url.split(',')[1],caption:''}]);await window.qa.sync.waitForFreeSync();},{place,url});
 await page.waitForFunction(id=>window.qa.store.db.freeQueue.toArray().then(q=>!q.some(i=>i.operation.place_id===id)),id,{timeout:10000});
 report.adminUploadImmediate=true;
 await page.evaluate(async place=>{
  localStorage.setItem('map-offline','true');
  const Refresh=(await import('/@react-refresh')).default;
  Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default,{MapView}=await import('/src/MapView.tsx');
  await import('/node_modules/leaflet/dist/leaflet.css');
  const selected={...place,name:'Aire de jeux test',category:'playground'};
  createRoot(document.getElementById('map-root')).render(React.createElement(MapView,{places:[selected],origin:{lat:place.lat,lon:place.lon,chosen:false},onSelect:()=>{},onCenter:()=>{},aerial:false,target:selected,routeStop:selected,routes:[]}));
 },place);
 await page.locator('.leaflet-overlay-pane path').waitFor();
 const colors=await page.evaluate(async()=>{const {colors}=await import('/src/types.ts');return colors;});
 assert.equal(await page.locator('.leaflet-overlay-pane path').getAttribute('fill'),colors.playground);
 report.selectedMarkerCategoryColor=true;
 await page.screenshot({path:resolve(output,'repere-jeux.png')});
 await page.evaluate(()=>window.qa.stop());
 await page.evaluate(()=>window.qa.cloud.logoutFreeAccount());
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'shared',id),{...shared(3,2),place:{...place,version:3,name:'Après déconnexion'}}));
 await page.waitForTimeout(300);
 assert.notEqual(await page.evaluate(id=>window.qa.store.db.places.get(id).then(p=>p?.name),id),'Après déconnexion');
 report.ignoresChangesAfterLogout=true;
 assert.deepEqual(remote,[]);assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report));
 await writeFile(resolve(root,'livraison/QA-ADMIN-SYNC-0.1.46.json'),JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();await env.cleanup();}
