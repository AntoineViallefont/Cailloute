import{createRequire}from'node:module';import{resolve}from'node:path';import{writeFile}from'node:fs/promises';import assert from'node:assert/strict';
const require=createRequire(resolve('app/package.json')),{chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});const report={version:'0.1.56',catalogPlaces:30000,errors:[]};
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname))return r.abort();
  if(u.pathname==='/__favorites_qa')return r.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="root"></div></body></html>'});
  if(u.pathname==='/src/useFreeAccount.ts')return r.fulfill({contentType:'text/javascript',body:'export function useFreeAccount(){return {uid:"alice",verified:true,termsAccepted:true,isAdmin:false,name:"Alice"}}'});
  if(u.pathname==='/src/store.ts'){
   const response=await r.fetch();const body=(await response.text()).replace('async function boot() {','async function boot() { return;');return r.fulfill({response,body});
  }
  return r.continue();
 });
 await page.goto('http://127.0.0.1:5194/__favorites_qa');
 report.query=await page.evaluate(async()=>{
  localStorage.setItem('map-offline','true');localStorage.setItem('account-welcome-v1','true');localStorage.setItem('origin',JSON.stringify({lat:45.7578,lon:4.832,chosen:true,label:'Lyon'}));
  const {db,favoritePlaces}=await import('/src/store.ts');window.qa={db,globalReads:0,bulkRows:0,favoritesPhase:true};
  const base={category:'child_activity',name:'Lieu',lat:48.8566,lon:2.3522,review_count:0,photo_count:0,rating:null,created:'2026-01-01',updated:'2026-01-01'};
  for(let offset=0;offset<30000;offset+=1000)await db.places.bulkPut(Array.from({length:1000},(_,i)=>({...base,id:'unrelated-'+(offset+i)})));
  const rows=Array.from({length:90},(_,i)=>({...base,id:'fav-'+i,name:'Favori '+i,lat:45.7578+i*.00002,lon:4.832}));
  const root={...base,id:'root',name:'Lieu fusionné',lat:45.7578,lon:4.832,catalog_sources:['source']};
  await db.places.bulkPut([...rows,root,{...root,id:'source',redirect:'root'},{...base,id:'deleted',lat:45.7578,lon:4.832}]);
  await db.catalogSources.put({id:'source',canonicalId:'root'});
  await db.favorites.bulkPut([...rows.map(p=>({id:p.id})),{id:'source'},{id:'deleted'}]);await db.removed.put({id:'deleted'});
  await db.personal.put({id:'source',base:root,patch:{address:'Adresse corrigée'},photos:[],removedPhotos:[],removedReviews:[],updated:'2026-10-04'});
  for(const table of [db.places,db.personal,db.details]){const original=table.toArray.bind(table);table.toArray=async()=>{if(window.qa.favoritesPhase){window.qa.globalReads++;throw new Error('Lecture globale interdite dans les favoris');}return original();};}
  const removed=db.removed.toCollection.bind(db.removed);db.removed.toCollection=()=>{if(window.qa.favoritesPhase)throw new Error('Lecture globale des suppressions interdite');return removed();};
  const bulk=db.places.bulkGet.bind(db.places);db.places.bulkGet=keys=>{window.qa.bulkRows+=keys.length;return bulk(keys);};
  const start=performance.now(),places=await favoritePlaces();window.qa.result=places;
  return {milliseconds:performance.now()-start,places:places.length,rootCount:places.filter(p=>p.id==='root').length,address:places.find(p=>p.id==='root')?.address,deleted:places.some(p=>p.id==='deleted'),globalReads:window.qa.globalReads,bulkRows:window.qa.bulkRows};
 });
 assert.equal(report.query.places,91);assert.equal(report.query.rootCount,1);assert.equal(report.query.address,'Adresse corrigée');assert.equal(report.query.deleted,false);assert.equal(report.query.globalReads,0);assert(report.query.bulkRows<400);
 // La carte explore peut consulter les suppressions globales ; rétablir uniquement cette opération.
 await page.evaluate(async()=>{
  const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  window.qa.favoritesPhase=false;
  const App=(await import('/src/App.tsx')).default;createRoot(document.getElementById('root')).render(React.createElement(App));
 });
 await page.getByRole('button',{name:'Liste',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.place-row').length===60);await page.evaluate(()=>window.qa.favoritesPhase=true);
 await page.getByRole('button',{name:'Favoris',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.place-row').length===60);
 report.listFavorites=true;
 await page.locator('.place-list').evaluate(n=>{n.scrollTop=600;n.dispatchEvent(new Event('scroll',{bubbles:true}));});
 const before=await page.locator('.place-list').evaluate(n=>n.scrollTop);
 await page.getByRole('button',{name:'Filtres',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 const after=await page.locator('.place-list').evaluate(n=>n.scrollTop);assert.equal(after,before);report.scrollPreserved=true;
 await page.getByRole('main').getByRole('button',{name:'Carte',exact:true}).click();await page.locator('.leaflet-container').waitFor();report.mapFavorites=true;
 assert.equal(await page.evaluate(()=>qa.globalReads),0);assert.deepEqual(report.errors,[]);
 await writeFile('livraison/QA-FAVORIS-0.1.56.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
