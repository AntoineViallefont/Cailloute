const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const origin='http://127.0.0.1:5187';const main=await(await fetch(origin+'/src/main.tsx')).text();
const react=main.match(/from "([^"]*\/react\.js\?[^\"]+)"/)[1];const dom=main.match(/from "([^"]*\/react-dom_client\.js\?[^\"]+)"/)[1];
const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:412,height:915}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__privacy_error_qa',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto(origin+'/__privacy_error_qa');
 await page.evaluate(async({react,dom,base64})=>{const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const React=(await import(react)).default;const ReactDOM=(await import(dom)).default;const {PhotoPrivacyReview}=await import('/src/PhotoPrivacyReview.tsx');const {preparePhoto}=await import('/src/photo-input.ts');
 window.__qa={saved:0,closed:0};const create=window.createImageBitmap;window.createImageBitmap=async(...args)=>{const image=await create(...args);const close=image.close.bind(image);image.close=()=>{window.__qa.closed++;close();};return image;};
 const original=await(await fetch('data:image/jpeg;base64,'+base64)).blob();const root=ReactDOM.createRoot(document.getElementById('root'));
 const show=prepared=>root.render(React.createElement(PhotoPrivacyReview,{key:crypto.randomUUID(),photo:{id:crypto.randomUUID(),original,prepared,automatic:[],manual:[],detectionFailed:true,reviewed:false},number:1,total:1,onSave:()=>{window.__qa.saved++;},onClose:()=>root.unmount()}));
 window.__qa.valid=async()=>{const prepared=await preparePhoto(original);window.__qa.beforeValid=window.__qa.closed;show(prepared);};window.__qa.unmount=()=>root.unmount();show({base64:btoa('ceci ne contient pas un JPEG'),caption:''});
 },{react,dom,base64:fs.readFileSync('app/src/test-data/photo-no-gps.jpg').toString('base64')});
 const dialog=page.getByRole('dialog',{name:'Vérifier la photo 1 / 1',exact:true});await dialog.getByRole('alert').waitFor();assert.match(await dialog.getByRole('alert').innerText(),/Photo illisible/);const validate=dialog.getByRole('button',{name:'Photo vérifiée',exact:true});assert(await validate.isDisabled());await validate.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>window.__qa.saved),0);assert.equal(await page.evaluate(()=>window.__qa.closed),1);
 await page.evaluate(()=>window.__qa.valid());await page.waitForFunction(()=>document.querySelector('dialog button.primary:not([disabled])'));assert(await validate.isEnabled());await page.evaluate(()=>window.__qa.unmount());assert.equal(await page.evaluate(()=>window.__qa.closed-window.__qa.beforeValid),2);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({invalidPreviewCannotBeValidated:true,saved:0,failedPreviewBitmapClosed:true,validPreviewCanBeValidated:true,twoBitmapsClosedOnUnmount:true,reactErrors:errors}));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});
