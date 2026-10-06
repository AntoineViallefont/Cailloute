import {createRequire} from 'node:module';import {resolve} from 'node:path';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:420,height:900},serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://cailloute-macavi.web.app/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>performance.getEntriesByName('cailloute:ready').length>0,null,{timeout:20000});
 if(await page.getByRole('button',{name:'Continuer sans compte',exact:true}).count())await page.getByRole('button',{name:'Continuer sans compte',exact:true}).click();
 await page.getByRole('button',{name:'Profil',exact:true}).click();await page.getByText('Cailloute · version 0.1.59',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Carte',exact:true}).last().click();await page.getByRole('button',{name:'Liste',exact:true}).click();
 await page.locator('.place-row .place-open').first().click();await page.locator('.place-sheet').waitFor();
 const report={version:'0.1.59',url:page.url(),readyMs:await page.evaluate(()=>performance.getEntriesByName('cailloute:ready')[0].startTime),profile:true,list:true,detail:true,errors};
 assert.deepEqual(errors,[]);await page.screenshot({path:'livraison/audit-0.1.59/hosted-detail.png'});await writeFile('livraison/audit-0.1.59/hosted-ui.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close()}
