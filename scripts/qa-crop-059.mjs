import {createRequire} from 'node:module';import {resolve} from 'node:path';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:420,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname))return r.abort();if(u.pathname==='/__crop')return r.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="root"></div></body></html>'});return r.continue()});
 await page.goto('http://127.0.0.1:5195/__crop');
 await page.evaluate(async()=>{
  const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {PhotoPrivacyReview}=await import('/src/PhotoPrivacyReview.tsx');const {preparePhoto}=await import('/src/photo-input.ts');
  const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='orange';x.fillRect(0,0,800,600);x.fillStyle='blue';x.fillRect(200,100,400,350);
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));const photo={id:'crop-test',original:blob,prepared:await preparePhoto(blob),automatic:[],manual:[],reviewed:false,detectionFailed:false};
  createRoot(document.getElementById('root')).render(React.createElement(PhotoPrivacyReview,{photo,number:1,total:1,onSave:p=>{window.savedPhoto=p},onClose:()=>{}}));
 });
 await page.getByRole('button',{name:'Recadrer',exact:true}).click();const canvas=page.locator('.privacy-review canvas');const box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8,{steps:10});await page.mouse.up();
 await page.getByRole('button',{name:'Appliquer le recadrage',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.privacy-review canvas').width<800);
 await page.getByRole('button',{name:'Photo vérifiée',exact:true}).click();await page.waitForFunction(()=>!!window.savedPhoto);
 const report=await page.evaluate(()=>({id:window.savedPhoto.id,reviewed:window.savedPhoto.reviewed,width:document.querySelector('.privacy-review canvas').width,height:document.querySelector('.privacy-review canvas').height,bytes:window.savedPhoto.prepared.base64.length}));
 assert.equal(report.id,'crop-test');assert.equal(report.reviewed,true);assert(report.width>100&&report.width<800&&report.height<600);assert.deepEqual(errors,[]);
 await writeFile('livraison/audit-0.1.59/crop.json',JSON.stringify({...report,errors},null,2)+'\n');console.log(report);
}finally{await browser.close()}
