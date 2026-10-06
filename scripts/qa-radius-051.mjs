import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
const report={version:'0.1.51',errors:[],productionCalls:0,bootstrapFiles:[],locations:[]};
try{
 const context=await browser.newContext(),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(!['localhost','127.0.0.1'].includes(url.hostname)){report.productionCalls++;return route.abort();}
  if(/^\/(seed|catalog-017|catalog-health-015|catalog-toilets-017|catalog-family-017)\.json$/.test(url.pathname))report.bootstrapFiles.push(url.pathname);
  if(url.pathname==='/__radius_qa')return route.fulfill({contentType:'text/html',body:'<html><body></body></html>'});
  return route.continue();
 });
 await page.goto('http://127.0.0.1:5194/__radius_qa');
 report.boot=await page.evaluate(async()=>{localStorage.setItem('map-offline','true');localStorage.setItem('origin',JSON.stringify({lat:48.8566,lon:2.3522,chosen:true,label:'Paris'}));const {boot,db}=await import('/src/store.ts');window.qa={db};const {initialFreeSyncMeta}=await import('/src/free-sync-policy.ts');await db.meta.put({key:'free-sync-v1',value:{...initialFreeSyncMeta(),pausedUntil:Date.now()+86400000}});const start=performance.now();await boot();while(!(await db.meta.get('photo-webp-migration')))await new Promise(r=>setTimeout(r,10));localStorage.setItem('map-offline','false');return {milliseconds:performance.now()-start,places:await db.places.count()};});
 assert.equal(report.boot.places,0);assert.deepEqual(report.bootstrapFiles,[]);
 for(const [name,lat,lon] of [['Paris',48.8566,2.3522],['Lyon',45.7578,4.832],['Paris',48.8566,2.3522]]){
  const location=await page.evaluate(async({name,lat,lon})=>{
   const {loadFranceBounds}=await import('/src/france-catalog.ts'),{distance,radiusBounds}=await import('/src/geo.ts');
   const radius=1000,origin={lat,lon},before=new Set(await window.qa.db.places.toCollection().primaryKeys()),start=performance.now();
   await loadFranceBounds(radiusBounds(origin,radius),()=>false,origin,radius);
   const after=await window.qa.db.places.toArray(),added=after.filter(p=>!before.has(p.id)&&!p.redirect);
   const inside=after.filter(p=>!p.redirect&&distance(origin,p)<=radius);
   return {name,milliseconds:performance.now()-start,newPlaces:added.length,visibleInside:inside.length,maximumNewDistance:Math.max(0,...added.map(p=>distance(origin,p))),outside:added.filter(p=>distance(origin,p)>radius).map(p=>({id:p.id,name:p.name,lat:p.lat,lon:p.lon,source:p.catalog_sources}))};
  },{name,lat,lon});
  console.log(JSON.stringify(location));assert(location.visibleInside>0);assert(location.maximumNewDistance<=1000,'Import hors rayon');report.locations.push(location);
 }
 assert.equal(report.locations[2].newPlaces,0);assert.equal(report.productionCalls,0);assert.deepEqual(report.errors,[]);
 await writeFile('livraison/QA-RAYON-0.1.51.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));await context.close();
}finally{await browser.close();}
