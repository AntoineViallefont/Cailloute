import {createRequire} from 'node:module';import {resolve} from 'node:path';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));const{chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:420,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const OriginalWorker=Worker;window.Worker=class extends OriginalWorker{constructor(...args){super(...args);if(String(args[0]).includes('photo-compression.worker')){window.qaCompression=this;this.addEventListener('message',e=>{e.stopImmediatePropagation();window.qaCompressed=e.data;},true);}}};});
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname))return r.abort();
  if(u.pathname==='/__photo_background')return r.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="root"></div></body></html>'});
  if(u.pathname==='/src/head-detection-client.ts')return r.fulfill({contentType:'text/javascript',body:'export const warmHeadDetector=()=>{};export const releaseHeadDetector=()=>{};export const detectHeads=async()=>({masks:[],incomplete:false});'});
  if(u.pathname==='/src/photo-privacy.ts')return r.fulfill({contentType:'text/javascript',body:'export async function preparePrivatePhoto(original){const base64=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(String(f.result).split(",")[1]);f.readAsDataURL(original)});return {id:crypto.randomUUID(),original,prepared:{base64,caption:""},automatic:[],manual:[],reviewed:false,detectionFailed:false};}'});
  return r.continue();
 });
 await page.goto('http://127.0.0.1:5195/__photo_background');
 await page.evaluate(async()=>{
  const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {PhotoPicker}=await import('/src/PhotoPicker.tsx');
  const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='orange';x.fillRect(0,0,800,600);x.fillStyle='blue';x.fillRect(200,100,400,350);window.qaImage=c.toDataURL();
  createRoot(document.getElementById('root')).render(React.createElement(PhotoPicker,{onAdd:p=>{window.qaAdded=p;return Promise.resolve()},onClose:()=>{}}));
 });
 const bytes=Buffer.from((await page.evaluate(()=>qaImage)).split(',')[1],'base64');await page.locator('input[type=file]').first().setInputFiles([{name:'a.png',mimeType:'image/png',buffer:bytes},{name:'b.png',mimeType:'image/png',buffer:bytes}]);
 await page.getByRole('dialog',{name:'Vérifier la photo 1 / 2',exact:true}).waitFor();
 await page.getByRole('button',{name:'Recadrer',exact:true}).click();const canvas=page.locator('.privacy-review canvas');const box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8,{steps:5});await page.mouse.up();
 const cropStart=Date.now();await page.getByRole('button',{name:'Appliquer le recadrage',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.privacy-review canvas').width===480);const cropMs=Date.now()-cropStart;
 await page.getByRole('button',{name:'Masquer toute la photo',exact:true}).click();const start=Date.now();await page.getByRole('button',{name:'Photo vérifiée',exact:true}).click();await page.getByRole('dialog',{name:'Vérifier la photo 2 / 2',exact:true}).waitFor();const confirmationMs=Date.now()-start;
 await page.waitForFunction(()=>!!window.qaCompressed);assert.equal(await page.getByText('Préparation…',{exact:true}).count(),1);
 // La seconde photo reste modifiable pendant que la première attend sa compression.
 await page.getByRole('button',{name:'Fermer',exact:true}).last().click();await page.getByRole('button',{name:'Retirer la photo 2',exact:true}).click();await page.getByRole('checkbox').check();const add=page.getByRole('button',{name:'Ajouter 1 photo',exact:true});assert(await add.isDisabled());
 await page.evaluate(()=>{window.oldCompression=qaCompression;window.oldResult=qaCompressed;qaCompressed=null;});
 await page.getByRole('button',{name:'Vérifier la photo 1',exact:true}).click();
 await page.getByRole('button',{name:'Annuler le dernier ajout',exact:true}).click();await page.getByRole('button',{name:'Masquer toute la photo',exact:true}).click();
 await page.getByRole('button',{name:'Photo vérifiée',exact:true}).click();
 await page.evaluate(()=>window.oldCompression.onmessage({data:window.oldResult}));assert(await add.isDisabled());
 await page.waitForFunction(()=>!!window.qaCompressed);await page.evaluate(()=>window.qaCompression.onmessage({data:window.qaCompressed}));await page.waitForFunction(()=>!document.querySelector('.privacy-drafts').innerText.includes('Préparation…'));await add.click();await page.waitForFunction(()=>!!window.qaAdded);
 const result=await page.evaluate(()=>({count:qaAdded.length,webp:qaAdded[0].base64.startsWith('UklGR'),bytes:atob(qaAdded[0].base64).length}));assert.equal(result.count,1);assert(result.webp);assert(result.bytes<=40000);assert(confirmationMs<1500);assert.deepEqual(errors,[]);
 const report={cropMs,confirmationMs,backgroundKeepsNextPhotoEditable:true,publishWaitsForCompression:true,reopenedMaskUndo:true,cancelledResultIgnored:true,...result,errors};await writeFile('livraison/QA-PHOTO-BACKGROUND-0.1.60.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close()}
