import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve('app/package.json'));
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const adb=(...args)=>execFileSync(resolve(process.env.HOME,'Library/Android/sdk/platform-tools/adb'),['-s','emulator-5580',...args],{encoding:'utf8'});
const pid=adb('shell','pidof','fr.cailloute.app').trim();adb('forward','tcp:9240','localabstract:webview_devtools_remote_'+pid);
const browser=await chromium.connectOverCDP('http://localhost:9240',{noDefaults:true});
try {
 const page=browser.contexts()[0].pages()[0];const mode=process.argv[2]||'check';
 if(mode==='prepare-offline') {
  console.log(await page.evaluate(async()=>{
   localStorage.setItem('origin',JSON.stringify({lat:45.1885,lon:5.7245,chosen:true,label:'Grenoble'}));
   localStorage.setItem('mapView',JSON.stringify([45.1885,5.7245,16]));localStorage.removeItem('mapViewport');
   const db=await new Promise(r=>{const q=indexedDB.open('Cailloute');q.onsuccess=()=>r(q.result)});
   const count=await new Promise(r=>{const q=db.transaction('places').objectStore('places').index('lat').getAll(IDBKeyRange.bound(45.18,45.2));q.onsuccess=()=>r(q.result.filter(p=>p.lon>5.71&&p.lon<5.74&&!p.redirect).length)});db.close();return {grenobleBefore:count};
  }));
 } else if(mode==='seed') {
  const fixture=await page.evaluate(async()=>{
   localStorage.setItem('account-welcome-v1','true');
   const db=await new Promise((r,j)=>{const q=indexedDB.open('Cailloute');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
   const p={id:'c_audit_preserve',name:'Lieu personnel de test',category:'playground',lat:45.7578,lon:4.832,address:'Adresse personnelle',city:'Lyon',hours:'Mo-Fr 09:00-17:00',description:'Texte personnel à conserver exactement.',age:'0-12',access:'',sources:[],rating:4,review_count:1,photo_count:1,version:1,community:true};
   const photo={id:'audit-photo',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',place_id:p.id,caption:'Photo personnelle'};
   const values={places:p,details:{...p,photos:[photo],reviews:[{id:'audit-review',user_id:'qa',author:'Test local',text:'Avis conservé',rating:4,created_at:'2026-09-01T12:00:00Z',updated_at:'2026-10-01T12:00:00Z'}]},personal:{id:p.id,base:p,patch:{description:p.description},createdLocally:true,informationEditedAt:'2026-10-05T10:00:00Z',updated:'2026-10-05T10:00:00Z',photos:[],removedPhotos:[],removedReviews:[]},favorites:{id:p.id}};
   await new Promise((r,j)=>{const tx=db.transaction(Object.keys(values),'readwrite');for(const[k,v]of Object.entries(values))tx.objectStore(k).put(v);tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close();return values;
  });
  await writeFile('livraison/audit-0.1.59/native-fixture.json',JSON.stringify(fixture,null,2)+'\n');console.log('Fixture locale créée dans 0.1.58');
 } else {
  await page.waitForFunction(()=>performance.getEntriesByName('cailloute:ready').length===1,null,{timeout:15000});
  const data=await page.evaluate(async()=>{
   const db=await new Promise((r,j)=>{const q=indexedDB.open('Cailloute');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
   const names=['places','details','personal','favorites'];const values={};
   for(const name of names)values[name]=await new Promise((r,j)=>{const q=db.transaction(name).objectStore(name).get('c_audit_preserve');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});
   db.close();return {values,readyMs:performance.getEntriesByName('cailloute:ready')[0].startTime,remoteCanonical:performance.getEntriesByType('resource').filter(e=>e.name.includes('/canonical/')&&!e.name.startsWith('https://localhost')).map(e=>e.name),text:document.body.innerText.slice(-1000)};
  });
  if(mode!=='fresh')assert.deepEqual(data.values,JSON.parse(await readFile('livraison/audit-0.1.59/native-fixture.json','utf8')));
  assert.equal(data.remoteCanonical.length,0);
  if(mode==='offline')await page.waitForFunction(async()=>{
   const db=await new Promise(r=>{const q=indexedDB.open('Cailloute');q.onsuccess=()=>r(q.result)});
   const count=await new Promise(r=>{const q=db.transaction('places').objectStore('places').index('lat').getAll(IDBKeyRange.bound(45.18,45.2));q.onsuccess=()=>r(q.result.filter(p=>p.lon>5.71&&p.lon<5.74&&p.catalog_version&&!p.redirect).length)});db.close();return count>50;
  },null,{timeout:20000});
  if(await page.getByRole('button',{name:'Continuer sans compte',exact:true}).count())await page.getByRole('button',{name:'Continuer sans compte',exact:true}).click();
  await page.getByRole('button',{name:'Profil',exact:true}).click();await page.getByText('0.1.59',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Carte',exact:true}).last().click();
  await page.getByRole('button',{name:'Liste',exact:true}).click();
  assert(await page.locator('main').innerText());
  assert.equal(await page.getByText('Chargement incomplet : les lieux déjà enregistrés restent disponibles.',{exact:true}).count(),0);
  await page.screenshot({path:'livraison/audit-0.1.59/android-'+mode+'.png'});
  await writeFile('livraison/audit-0.1.59/native-'+mode+'.json',JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({mode,readyMs:data.readyMs,preserved:mode!=='fresh',remoteCanonical:data.remoteCanonical.length,navigation:true}));
 }
}finally{await browser.close();}
