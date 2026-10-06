import {gunzipSync} from 'node:zlib';import {createRequire} from 'node:module';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {compactPlace} from './publish-open-photos.mjs';
const root=process.cwd(),require=createRequire(resolve(root,'app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {initializeTestEnvironment}=await import(require.resolve('@firebase/rules-unit-testing'));
const {doc,setDoc,Timestamp}=await import(require.resolve('firebase/firestore'));
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:await readFile('firestore.rules','utf8')}});
const plan=JSON.parse(await readFile('donnees/enrichissement-ouvert/photos-validees-0.1.45.json','utf8'));
const row=plan.candidates.find(c=>c.place.name.toLowerCase().startsWith('lugdunum'));
const catalog=JSON.parse(gunzipSync(await readFile('app/public/canonical/183_19.json.gz')).toString('utf8'));
const group=catalog.groups.find(g=>g.originals.some(p=>p.id===row.place.id));assert(group);assert.equal(group.originals.length,2);
const photoId=row.place.id+'_open_'+row.photo.caption.split(':')[1].split('|')[0];
await env.withSecurityRulesDisabled(async ctx=>{
 await setDoc(doc(ctx.firestore(),'shared',row.place.id),{place:{...compactPlace({...row.place,...row.patch}),photo_count:1},reviews:{bob:{id:'bob',user_id:'bob',author:'Bob',stars:4,text:'Avis conservé',created:new Date().toISOString(),votes:0,voters:[]}},deleted:false,version:1,cell:'183:19',updated:Timestamp.now(),by:'open-catalog',kind:'photo.add',lastPhoto:photoId,lastOp:'import'});
 await setDoc(doc(ctx.firestore(),'previews',photoId),{placeId:row.place.id,user_id:'open-catalog',author:'Catalogue libre',url:row.photo.url,caption:row.photo.caption,created:Timestamp.now()});
});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});const report={productionCalls:0,errors:[]};
try{
 const page=await browser.newPage({viewport:{width:412,height:915}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname)){report.productionCalls++;return route.abort();}
  if(url.pathname==='/__lugdunum_qa')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body><div id="root"></div></body></html>'});return route.continue();
 });
 await page.goto('http://127.0.0.1:5194/__lugdunum_qa');
 await page.evaluate(async group=>{
  const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {db}=await import('/src/store.ts'),canonical=await import('/src/canonical-store.ts');window.qa={db};document.documentElement.dataset.theme='dark';
  await db.places.bulkPut(group.originals);
  await db.personal.put({id:group.originals[1].id,base:group.originals[1],patch:{address:'17 rue Cléberg — entrée du musée'},photos:[],removedPhotos:[],removedReviews:[],updated:new Date().toISOString()});
  await canonical.prepareCanonicalCatalog();await canonical.canonicalizeImported(group.originals.map(p=>p.id));
  const places=await db.places.toArray();window.qa.visible=places.filter(p=>!p.redirect&&!p.deleted);window.qa.root=group.id;
  const place=await db.places.get(group.id),{Detail}=await import('/src/Detail.tsx');
  createRoot(document.getElementById('root')).render(React.createElement(Detail,{place,aerial:false,origin:{lat:45.76,lon:4.82,chosen:true,label:'Ma position'},pmr:false,onClose:()=>{},onShowMap:()=>{},onLogin:()=>{},toast:message=>{window.qa.toast=message;}}));
 },group);
 assert.equal(await page.evaluate(()=>window.qa.visible.length),1);report.twoSourcesOnePlace=true;
 await page.locator('.featured-photos img').waitFor();await page.waitForFunction(()=>document.querySelector('.featured-photos img')?.naturalWidth>0&&!document.body.innerText.includes('Chargement des informations et des photos…'));
 const text=await page.locator('.detail').innerText();assert(text.includes('musée archéologique de Lyon'));assert(text.includes('11:00'));assert(text.includes('Payant'));assert(text.includes('17 rue Cléberg — entrée du musée'));assert(text.includes('Avis conservé'));
 report.fullInformationAtOpen=true;report.photoAtOpen=true;report.privateCorrectionPreserved=true;report.reviewPreserved=true;
 await page.evaluate(()=>{localStorage.setItem('map-offline','true');window.dispatchEvent(new Event('map-mode'));});
 await page.getByText('Hors connexion : seules les données enregistrées sont disponibles.').waitFor();assert.equal(await page.locator('.featured-photos img').count(),1);report.offlineCachePreserved=true;
 await mkdir('livraison/apercus-0.1.49',{recursive:true});await page.locator('.sheet-handle').click();await page.screenshot({path:'livraison/apercus-0.1.49/lugdunum-fusion.png'});
 assert.equal(report.productionCalls,0);assert.deepEqual(report.errors,[]);await writeFile('livraison/QA-LUGDUNUM-0.1.49.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{await browser.close();await env.cleanup();}
