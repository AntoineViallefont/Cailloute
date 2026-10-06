import {createRequire} from 'node:module';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';import {readdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const adb=(...args)=>execFileSync(resolve(process.env.HOME,'Library/Android/sdk/platform-tools/adb'),['-s','emulator-5580',...args],{encoding:'utf8'});
const pid=adb('shell','pidof','fr.cailloute.app').trim();adb('forward','tcp:9240','localabstract:webview_devtools_remote_'+pid);
const file=(await readdir('app/android/app/src/main/assets/public/assets')).find(n=>n.startsWith('photo-compression.worker-')&&n.endsWith('.js'));assert(file);
const browser=await chromium.connectOverCDP('http://localhost:9240',{noDefaults:true});
try{
 const page=browser.contexts()[0].pages()[0];await page.waitForFunction(()=>performance.getEntriesByName('cailloute:ready').length>0,null,{timeout:15000});
 const report=await page.evaluate(async file=>{
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1200;const context=canvas.getContext('2d');const image=context.createImageData(1600,1200);let seed=7;
  for(let at=0;at<image.data.length;at+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;image.data[at]=seed&255;image.data[at+1]=seed>>>8&255;image.data[at+2]=seed>>>16&255;image.data[at+3]=255;}context.putImageData(image,0,0);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const worker=new Worker('/assets/'+file,{type:'module'});let ticks=0;const timer=setInterval(()=>ticks++,20);const start=performance.now();
  try{const result=await new Promise((resolve,reject)=>{const limit=setTimeout(()=>reject(Error('Worker trop lent')),60000);worker.onmessage=e=>{clearTimeout(limit);e.data.blob?resolve(e.data.blob):reject(Error(e.data.error))};worker.onerror=e=>{clearTimeout(limit);reject(Error(e.message))};worker.postMessage({blob});});const bitmap=await createImageBitmap(result);const info={version:'0.1.60',workerMs:performance.now()-start,uiTicks:ticks,inputBytes:blob.size,bytes:result.size,type:result.type,width:bitmap.width,height:bitmap.height};bitmap.close();return info;}finally{clearInterval(timer);worker.terminate();}
 },file);
 assert.equal(report.type,'image/webp');assert(report.bytes<=40000);assert(report.width<=960&&report.height<=960);assert(report.uiTicks>3);
 await page.getByRole('button',{name:'Profil',exact:true}).click();await page.getByText('Cailloute · version 0.1.60',{exact:true}).waitFor();
 await writeFile('livraison/QA-NATIVE-PHOTO-BACKGROUND-0.1.60.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close()}
