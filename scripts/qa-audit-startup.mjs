import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {writeFile,readFile} from 'node:fs/promises';
const require=createRequire(resolve('app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
try {
 for(const scenario of ['migration-network-stalled','map-network-stalled','invalid-preferences','invalid-user','missing-interface']) {
  const context=await browser.newContext(),page=await context.newPage(),errors=[];let blocked=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(scenario==='missing-interface'&&url.pathname==='/src/main.tsx')return route.abort();
   if(url.pathname==='/__audit')return route.fulfill({contentType:'text/html',body:'<body></body>'});
   if(scenario==='migration-network-stalled'&&url.pathname.startsWith('/canonical/')){blocked++;return;}
   if(scenario==='map-network-stalled'&&url.hostname==='data.geopf.fr'){blocked++;return;}
   if(!['localhost','127.0.0.1'].includes(url.hostname))return route.abort();
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5195/__audit');
  await page.evaluate(async scenario=>{
   localStorage.setItem('account-welcome-v1','true');
   localStorage.setItem('origin',JSON.stringify({lat:45.7578,lon:4.832,chosen:true,label:'Lyon'}));
   if(scenario==='invalid-user')localStorage.setItem('user','{');
   if(scenario==='invalid-preferences')localStorage.setItem('filters-v10',JSON.stringify({categories:null,transitModes:null,radius:'invalide'}));
   const {db}=await import('/src/store.ts');
   const {initialFreeSyncMeta}=await import('/src/free-sync-policy.ts');
   await db.meta.put({key:'free-sync-v1',value:{...initialFreeSyncMeta(),pausedUntil:Date.now()+86400000}});
   if(scenario==='migration-network-stalled') {
    const index=await(await fetch('/france/index.json')).json();
    const tile=index.tiles.find(t=>t.bounds[0]<2.35&&t.bounds[2]>2.35&&t.bounds[1]<48.86&&t.bounds[3]>48.86);
    const rows=await(await fetch('/france/'+tile.file)).json();
    await db.places.bulkPut(rows.slice(0,30));
   }
  },scenario);
  await page.goto('http://127.0.0.1:5195/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(10000);
  const state=await page.evaluate(()=>({ready:performance.getEntriesByName('cailloute:ready').length>0,body:document.body.innerText.slice(-800),buttons:document.querySelectorAll('button').length}));
  if(process.env.EXPECT_FIXED){if(scenario==='missing-interface')assert(state.body.includes('Réessayer'));else{assert(state.ready,scenario);assert.deepEqual(errors,[]);await page.getByRole('button',{name:'Profil',exact:true}).click();await page.getByText('Cailloute · version 0.1.59',{exact:true}).waitFor();}}
  report.push({scenario,blocked,errors,...state});console.log(JSON.stringify(report.at(-1)));
  await context.close();
 }
 await writeFile(process.env.AUDIT_REPORT||'livraison/audit-0.1.59/before.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();}
