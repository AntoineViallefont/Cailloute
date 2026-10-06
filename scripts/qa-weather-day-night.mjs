import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../app/package.json',import.meta.url));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=resolve(root,'livraison/apercus-0.1.46');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={solarBoundary:true,offlineNightAdvice:true,weatherCalls:0,airCalls:0,firebaseCalls:0,errors:[]};
try{
 const page=await browser.newPage({viewport:{width:412,height:915},timezoneId:'America/New_York'});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-03T17:09:00Z')});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='api.open-meteo.com'){
   report.weatherCalls++;assert.equal(u.searchParams.get('daily'),'sunrise,sunset');assert(u.searchParams.get('current').includes('is_day'));
   return route.fulfill({json:{current:{time:'2026-10-03T17:00',temperature_2m:16,wind_speed_10m:5,weather_code:0,is_day:1},hourly:{time:['2026-10-03T17:00','2026-10-03T18:00'],uv_index:[4,0],rain:[0,0],showers:[0,0],precipitation_probability:[0,0]},daily:{time:['2026-10-03','2026-10-04'],sunrise:['2026-10-03T05:45','2026-10-04T05:46'],sunset:['2026-10-03T17:10','2026-10-04T17:08']}}});
  }
  if(u.hostname==='air-quality-api.open-meteo.com'){report.airCalls++;return route.fulfill({json:{current:{time:'2026-10-03T17:00',european_aqi:15}}});}
  if(!['127.0.0.1','localhost'].includes(u.hostname)){report.firebaseCalls++;return route.abort();}
  if(u.pathname==='/__weather_qa')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="root"></div></body></html>'});
  return route.continue();
 });
 await page.goto('http://127.0.0.1:5194/__weather_qa');
 await page.evaluate(async()=>{
  const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default,{Weather}=await import('/src/Weather.tsx'),{LYON}=await import('/src/types.ts');
  createRoot(document.getElementById('root')).render(React.createElement(Weather,{origin:LYON}));
 });
 await page.getByText('Soleil',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Météo : ouvrir les conseils de sortie'}).click();
 const tips=page.locator('.weather-advice');assert((await tips.textContent()).includes('petite veste'));assert((await tips.textContent()).includes('UV'));
 await page.screenshot({path:resolve(output,'meteo-jour.png')});
 await page.evaluate(()=>localStorage.setItem('map-offline','true'));
 await page.clock.fastForward(61000);
 await page.getByText('Nuit claire',{exact:true}).waitFor();
 assert.equal(await page.locator('.weather > span').nth(2).locator('b').textContent(),'—');
 const night=await tips.textContent();assert(night.includes('parcours éclairé'));assert(!/UV|SPF|soleil|ombre/.test(night));
 assert.equal(report.weatherCalls,1);assert.equal(report.airCalls,1);assert.equal(report.firebaseCalls,0);
 await page.screenshot({path:resolve(output,'meteo-nuit.png')});
 assert.deepEqual(report.errors,[]);
 await writeFile(resolve(root,'livraison/QA-METEO-0.1.46.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
