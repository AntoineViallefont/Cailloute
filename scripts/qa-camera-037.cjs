const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {execFileSync}=require('node:child_process');const fs=require('node:fs'),assert=require('node:assert/strict');
const adb=(...args)=>execFileSync(process.env.HOME+'/Library/Android/sdk/platform-tools/adb',['-s','emulator-5562',...args],{encoding:'utf8'});
const dir='livraison/apercus-0.1.37';
const xml=()=>{adb('shell','uiautomator','dump','/sdcard/qa-camera-037.xml');return adb('shell','cat','/sdcard/qa-camera-037.xml');};
async function node(label){for(let n=0;n<12;n++){const tree=xml(),tag=tree.match(new RegExp('<node[^>]*content-desc="'+label+'"[^>]*>'))?.[0];if(tag&&tag.includes('enabled="true"'))return tag;await new Promise(r=>setTimeout(r,300));}throw Error('Commande absente : '+label);}
async function tap(label){const tag=await node(label),q=tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);adb('shell','input','tap',String(Math.round((q[0]+q[2])/2)),String(Math.round((q[1]+q[3])/2)));}
(async()=>{const browser=await chromium.connectOverCDP('http://127.0.0.1:9242',{noDefaults:true});try{
 const page=browser.contexts()[0].pages()[0];await page.waitForFunction(()=>window.Capacitor?.nativePromise);
 await page.evaluate(()=>{window.__cameraResult=null;window.__cameraError=null;window.Capacitor.nativePromise('CaillouteCamera','takePhoto',{limit:3}).then(r=>window.__cameraResult=r,e=>window.__cameraError=String(e));});
 await node('Prendre une photo');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/camera.png',execFileSync(process.env.HOME+'/Library/Android/sdk/platform-tools/adb',['-s','emulator-5562','exec-out','screencap','-p']));
 await tap('Prendre une photo');await node('Valider les photos');assert(xml().includes('Valider · 1'));
 await tap('Prendre une photo');await node('Prendre une photo');assert(xml().includes('Valider · 2'));
 fs.writeFileSync(dir+'/camera-deux-photos.png',execFileSync(process.env.HOME+'/Library/Android/sdk/platform-tools/adb',['-s','emulator-5562','exec-out','screencap','-p']));
 await tap('Valider les photos');await page.waitForFunction(()=>window.__cameraResult||window.__cameraError);const result=await page.evaluate(()=>({result:window.__cameraResult,error:window.__cameraError}));assert(!result.error);assert.equal(result.result.files.length,2);
 const previews=await page.evaluate(async files=>{const result=[];for(const file of files){const p=await window.Capacitor.nativePromise('CaillouteFaces','prepare',{uri:file.uri,includePosition:false,id:crypto.randomUUID()});const raw=atob(p.preview.base64);result.push({bytes:raw.length,signature:raw.slice(0,4),format:raw.slice(8,12),masks:p.masks.length});}return result;},result.result.files);
 assert(previews.every(p=>p.bytes<=40000&&p.signature==='RIFF'&&p.format==='WEBP'));
 const report={successivePhotos:2,previews,device:'Émulateur Android API 36.1'};fs.writeFileSync(dir+'/validation-camera.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
