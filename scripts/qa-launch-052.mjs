import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={version:'0.1.52',errors:[],firebaseCalls:0};
try{
 const context=await browser.newContext(),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 let releaseCatalog,releaseTiles;const catalogs=new Promise(r=>releaseCatalog=r),tiles=new Promise(r=>releaseTiles=r);
 let catalogRequests=0,tileRequests=0;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='data.geopf.fr'){
   tileRequests++;await tiles;
   return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
  }
  if(!['localhost','127.0.0.1'].includes(url.hostname)){
   if(/firestore|firebaseio/.test(url.hostname))report.firebaseCalls++;
   return route.abort();
  }
  if(url.pathname==='/__launch_qa')return route.fulfill({contentType:'text/html',body:'<html><body></body></html>'});
  if(url.pathname.startsWith('/france/') && url.pathname!='/france/index.json'){catalogRequests++;await catalogs;}
  return route.continue();
 });
 await page.goto('http://127.0.0.1:5194/__launch_qa');
 await page.evaluate(async()=>{
  localStorage.setItem('origin',JSON.stringify({lat:45.7578,lon:4.832,chosen:true,label:'Lyon'}));
  localStorage.setItem('account-welcome-v1','true');localStorage.setItem('mapView',JSON.stringify({lat:45.7578,lon:4.832,zoom:17}));
  const {db}=await import('/src/store.ts');const {initialFreeSyncMeta}=await import('/src/free-sync-policy.ts');
  await db.meta.put({key:'free-sync-v1',value:{...initialFreeSyncMeta(),pausedUntil:Date.now()+86400000}});
 });
 await page.goto('http://127.0.0.1:5194/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('.leaflet-container'));
 await page.waitForTimeout(3000);
 assert(catalogRequests>0);assert(tileRequests>0);
 assert.equal(await page.evaluate(()=>performance.getEntriesByName('cailloute:ready').length),0);
 report.waitedBeyondTwoSeconds=true;releaseCatalog();
 await page.waitForTimeout(1200);
 assert.equal(await page.evaluate(()=>performance.getEntriesByName('cailloute:ready').length),0);
 report.waitedForTilesAfterCatalog=true;releaseTiles();
 await page.waitForFunction(()=>performance.getEntriesByName('cailloute:ready').length===1,{},{timeout:30000});
 report.readyMilliseconds=await page.evaluate(()=>performance.getEntriesByName('cailloute:ready')[0].startTime);
 await page.evaluate(()=>{window.qaMap=document.querySelector('.leaflet-container');window.qaTiles=[...document.querySelectorAll('.leaflet-tile')];window.qaTheme=document.documentElement.dataset.theme;});
 const requestsBefore=tileRequests;
 await page.evaluate(()=>{window.dispatchEvent(new Event('cailloute-launch'));window.dispatchEvent(new Event('cailloute-appearance'));document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(500);
 report.foreground=await page.evaluate(()=>({sameMap:window.qaMap===document.querySelector('.leaflet-container'),sameTiles:window.qaTiles.every(tile=>tile.isConnected),sameTheme:window.qaTheme===document.documentElement.dataset.theme,readySignals:performance.getEntriesByName('cailloute:ready').length}));
 assert.deepEqual(report.foreground,{sameMap:true,sameTiles:true,sameTheme:true,readySignals:1});assert.equal(tileRequests,requestsBefore);
 await page.getByRole('button',{name:'Profil',exact:true}).click();
 const profileText=await page.locator('main').innerText();
 await page.evaluate(()=>window.dispatchEvent(new Event('cailloute-launch')));
 assert.equal(await page.locator('main').innerText(),profileText);report.profilePreserved=true;
 await page.evaluate(()=>localStorage.setItem('map-offline','true'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>performance.getEntriesByName('cailloute:ready').length===1,{},{timeout:30000});
 assert.equal(tileRequests,requestsBefore);report.offlineCachedReady=true;
 // Sans tuiles enregistrées, une indisponibilité terminée doit également libérer le lancement.
 await page.evaluate(async()=>{const {mapDB}=await import('/src/map-cache.ts');await mapDB.tiles.clear();});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>performance.getEntriesByName('cailloute:ready').length===1,{},{timeout:30000});
 assert.equal(tileRequests,requestsBefore);report.offlineMissingTilesReady=true;assert.deepEqual(report.errors,[]);
 await writeFile('livraison/QA-CHARGEMENT-0.1.52.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));await context.close();
}finally{await browser.close();}
