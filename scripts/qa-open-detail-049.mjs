import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {compactPlace} from './publish-open-photos.mjs';
const root=process.cwd(),require=createRequire(resolve(root,'app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {initializeTestEnvironment}=await import(require.resolve('@firebase/rules-unit-testing'));
const {doc,setDoc,Timestamp}=await import(require.resolve('firebase/firestore'));
const environment=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:await readFile('firestore.rules','utf8')}});
const id='p_92356fa8233550139f9f6be2fc4a86c8',photoId=id+'_open_79013046';
const row=JSON.parse(await readFile('donnees/enrichissement-ouvert/photos-validees-0.1.45.json','utf8')).candidates.find(c=>c.place.id===id);
assert(row?.photo,'Photo validée absente du catalogue');
const shared={place:{...compactPlace({...row.place,...row.patch}),photo_count:5},reviews:{},deleted:false,version:1,cell:'182:19',kind:'photo.add',lastPhoto:photoId,by:'open-catalog',lastOp:'open_79013046'};
const photo={placeId:id,user_id:'open-catalog',author:'Catalogue libre',url:row.photo.url,caption:row.photo.caption,privacy_reviewed:true,rights_accepted:true,lastOp:'open_79013046'};
await environment.withSecurityRulesDisabled(async ctx=>{
 await setDoc(doc(ctx.firestore(),'shared',id),{...shared,updated:Timestamp.now()});
 await setDoc(doc(ctx.firestore(),'previews',photoId),{...photo,created:Timestamp.now()});
 for(let n=1;n<=4;n++)await setDoc(doc(ctx.firestore(),'previews',id+'_qa_copy_'+n),{...photo,created:Timestamp.now()});
});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
const report={placeId:id,photoId,bytes:Buffer.from(photo.url.split(',')[1],'base64').length,productionWrites:0,qaProductionCalls:0,errors:[]};
await mkdir('livraison/apercus-0.1.49',{recursive:true});
try{
 for(const scenario of ['legacy-empty','automatic-limit','catalog-source','other-source']){
  const context=await browser.newContext({viewport:{width:412,height:915}}),page=await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(!['localhost','127.0.0.1'].includes(url.hostname)){report.qaProductionCalls++;return route.abort();}
   if(url.pathname==='/__comoedia_qa')return route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/src/style.css"></head><body data-theme="dark"><div id="root"></div></body></html>'});
   return route.continue();
  });
  await page.goto('http://127.0.0.1:5194/__comoedia_qa');
  await page.evaluate(async({place,scenario})=>{
   const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   const {db}=await import('/src/store.ts');window.qa={db};
   localStorage.setItem('theme','dark');document.documentElement.dataset.theme='dark';
   if(scenario==='catalog-source')place={...place,id:'p_7d69dd9f5c2650f7a7d0919693a134b0',name:'Comoedia',lat:45.747368,lon:4.835557,description:'',hours:'',website:'',wheelchair:null,photo_count:0,community:false};
   if(scenario==='other-source')place={...place,id:'c_qa_comoedia',name:'Comoedia',description:'',hours:'',website:'',wheelchair:null,photo_count:0,community:true};
   window.qa.inputId=place.id;await db.places.put(place);await db.details.put({...place,photos:[],reviews:[]});
   // Le nom et l'adresse privés du téléphone restent prioritaires.
   await db.personal.put({id:place.id,base:place,patch:{name:'Comoedia',address:'13 Av. Berthelot, 69007 Lyon, France'},photos:[],removedPhotos:[],removedReviews:[],updated:new Date().toISOString()});
   await db.meta.put({key:'free-version:'+place.id,value:1});
   if(scenario==='legacy-empty')await db.meta.put({key:'free-previews:'+place.id,value:1});
   else if(scenario==='automatic-limit') {const {reserveReads}=await import('/src/cloud-budget.ts');await reserveReads(50,'manual');}
   const {Detail}=await import('/src/Detail.tsx');
   createRoot(document.getElementById('root')).render(React.createElement(Detail,{place,aerial:false,origin:{lat:45.755,lon:4.838,chosen:true,label:'Ma position'},pmr:false,onClose:()=>{},onShowMap:()=>{},onLogin:()=>{},toast:message=>{window.qa.toast=message;}}));
  },{place:shared.place,scenario});
  
  const image=page.getByRole('img',{name:'Photo de Comoedia',exact:true}).first();await image.waitFor();
  await page.waitForFunction(()=>document.querySelector('.featured-photos img')?.naturalWidth>0);
  assert((await page.locator('.place-location').innerText()).includes('13 Av. Berthelot, 69007 Lyon, France'));
  assert(await page.getByText('Benoît Prieur',{exact:false}).count());
  await page.waitForFunction(()=>!document.body.innerText.includes('Chargement des informations et des photos…'));
  assert((await page.locator('.detail').innerText()).includes('salle de cinéma à Lyon, France'));
  assert((await page.locator('.detail').innerText()).includes('10:30'));
  await page.evaluate(async()=>{const {loadOpenedDetail}=await import('/src/open-detail.ts');await loadOpenedDetail(window.qa.inputId);});
  const snapshot=await page.evaluate(async()=>{let root=await window.qa.db.places.get(window.qa.inputId);while(root?.redirect)root=await window.qa.db.places.get(root.redirect);return {rootId:root?.id,details:(await window.qa.db.details.toArray()).map(d=>({id:d.id,count:d.photos.length})),pages:(await window.qa.db.meta.toArray()).filter(r=>r.key.startsWith('free-preview-page:')).map(r=>({key:r.key,value:r.value})),toast:window.qa.toast};});console.log(scenario,JSON.stringify(snapshot));
  const expected=snapshot.rootId;const count=snapshot.details.find(d=>d.id===expected)?.count;assert.equal(count,5);
  await page.getByRole('button',{name:'Voir plus de photos',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.featured-photos img').length===5);
  const repeated=await page.evaluate(async()=>{
   const {loadOpenedDetail}=await import('/src/open-detail.ts');
   const start=performance.now();for(let n=0;n<10;n++)await loadOpenedDetail(window.qa.inputId);
   return {milliseconds:performance.now()-start,opens:10};
  });
  assert(repeated.milliseconds<1000,'Réouvertures du cache trop lentes');report[scenario+'-cached-reopens']=repeated;
  const renderLatency=await page.evaluate(async()=>{
   const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   const {Detail}=await import('/src/Detail.tsx');const place=await window.qa.db.places.get(window.qa.inputId);
   const node=document.createElement('div');document.body.append(node);const root=createRoot(node),start=performance.now();
   const elapsed=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{observer.disconnect();reject(Error('Fiche locale trop lente'));},2000);
    const observer=new MutationObserver(()=>{if(node.querySelector('.featured-photos img')){clearTimeout(timer);observer.disconnect();resolve(performance.now()-start);}});
    observer.observe(node,{childList:true,subtree:true});
    root.render(React.createElement(Detail,{place,aerial:false,origin:{lat:45.755,lon:4.838,chosen:true,label:'Ma position'},pmr:false,onClose:()=>{},onShowMap:()=>{},onLogin:()=>{},toast:()=>{}}));
   });
   root.unmount();node.remove();return elapsed;
  });
  assert(renderLatency<1000);report[scenario+'-cached-photo-render-ms']=renderLatency;
  report.allPhotosLoadedAtOpen=true;report[scenario]=true;
  report.image=await image.evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
  await page.screenshot({path:resolve('livraison/apercus-0.1.49',scenario+'.png')});
  await context.close();
 }
 assert.equal(report.qaProductionCalls,0);assert.deepEqual(report.errors,[]);
 await writeFile('livraison/QA-COMOEDIA-0.1.49.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await environment.cleanup();}
