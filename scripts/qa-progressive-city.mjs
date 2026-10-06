import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();
  if(url.pathname==='/__progressive_qa')return route.fulfill({contentType:'text/html',body:'<html><body></body></html>'});return route.continue();
 });
 await page.goto('http://127.0.0.1:5194/__progressive_qa');
 const report=await page.evaluate(async()=>{
  localStorage.setItem('map-offline','false');
  const {db}=await import('/src/store.ts'),{loadFranceProgressively}=await import('/src/france-catalog.ts'),{distance,radiusBounds}=await import('/src/geo.ts');
  const origin={lat:45.1885,lon:5.7245},radius=5000,steps=[],start=performance.now();
  const longTasks=[];const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push(entry.duration);});observer.observe({type:'longtask',buffered:true});
  await loadFranceProgressively(radiusBounds(origin,radius),()=>false,origin,radius,()=>steps.push({ms:performance.now()-start}));
  const places=(await db.places.toArray()).filter(p=>!p.redirect);observer.disconnect();
  const first=performance.now()-start,warm=performance.now();
  await loadFranceProgressively(radiusBounds(origin,radius),()=>false,origin,radius);
  return {city:'Grenoble',radius,steps,coldMs:first,warmMs:performance.now()-warm,places:places.length,maxDistance:Math.max(...places.map(p=>distance(origin,p))),catalogGroups:await db.catalogGroups.count(),largestMainThreadTaskMs:Math.max(0,...longTasks)};
 });
 assert(report.places>0);assert(report.maxDistance<=5000);assert.equal(errors.length,0);
 await writeFile('livraison/QA-CHARGEMENT-PROGRESSIF.json',JSON.stringify({...report,errors},null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
