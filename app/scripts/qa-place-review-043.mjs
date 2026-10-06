import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {doc,setDoc,getDoc,Timestamp,updateDoc} from 'firebase/firestore';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('../firestore.rules','utf8')}});
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('../livraison/apercus-0.1.43',{recursive:true});
const place={id:'qa-place-043',version:1,name:'Jeux enregistrés',category:'playground',lat:45.75,lon:4.83,address:'12 rue des Jeux',city:'Lyon',hours:'Mo-Fr 09:00-18:00',description:'Texte problématique',website:'https://exemple.fr',age:'2–6 ans',access:'public',wheelchair:true,changing_table:false,drinking_water:true,free:true,fenced:false,elevator:null,bench:true,shade:false,shelter:true,condition:'open',sources:[],rating:null,review_count:0,community:true,photo_count:1};
try {
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'system','budget'),{members:100,places:100,previews:100,lastType:'',lastId:''}));
 const page=await browser.newPage({viewport:{width:412,height:915}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('map-offline','true'));
 await page.goto('http://127.0.0.1:5187/suppression-compte');
 await page.evaluate(async()=>{
  window.qa={cloud:await import('/src/free-cloud.ts'),store:await import('/src/store.ts'),sync:await import('/src/free-sync.ts'),budget:await import('/src/cloud-budget.ts')};
  const dm=await import('/node_modules/.vite/deps/dexie.js');(dm.default||dm.Dexie).debug=true; const c=window.qa.cloud;try {await c.registerFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!','AdminQA'+Date.now(),true);}catch(e){if(!String(e).includes('email-already-in-use'))throw e;await c.loginFreeAccount('admin-secondaire@example.invalid','Cailloute-Test-2026!');}
 });
 if(!(await page.evaluate(()=>window.qa.cloud.getFreeSession().verified))){const data=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-cailloute-free/oobCodes')).json();const code=data.oobCodes.findLast(c=>c.email==='admin-secondaire@example.invalid'&&c.requestType==='VERIFY_EMAIL');await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oobCode:code.oobCode})});}
 await page.evaluate(async()=>{const c=window.qa.cloud;await c.reloadFreeSession();if(!c.getFreeSession().termsAccepted)await c.acceptFreeTerms('AdminQA'+Date.now(),true);await window.qa.store.db.meta.delete(window.qa.budget.BUDGET_KEY);});
 const photoUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=200;return c.toDataURL('image/webp');});
 const uid=await page.evaluate(()=>window.qa.cloud.getFreeSession().uid);
 const review={id:'other',user_id:'other',author:'Autre',place_id:place.id,stars:4,text:'Avis à conserver',created:'2026-10-02',updated:'2026-10-02',votes:1,voters:['voter'],downvotes:0,downvoters:[]};
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'shared',place.id),{place,reviews:{other:review},deleted:false,version:1,updated:Timestamp.now(),cell:'183:19',lastOp:'seed',by:'someone',kind:'place.create',lastPhoto:''});await setDoc(doc(db,'previews',place.id+'_photo'),{placeId:place.id,user_id:'other',author:'Autre',url:photoUrl,caption:'Photo conservée',privacy_reviewed:true,rights_accepted:true,created:Timestamp.now(),lastOp:'photo'});await setDoc(doc(db,'reports','qa-place-report-043'),{uid:'someone',placeId:place.id,reviewId:'',photoId:'',reason:'Texte à corriger',status:'pending',created:Timestamp.now()});});
 await page.evaluate(async place=>{const q=window.qa;await q.store.db.places.put(place);localStorage.setItem('map-offline','false');const c=await q.cloud.getFreeReportedPlace(place.id);await q.sync.applyFreeChanges([c]);const rm=await import('/node_modules/.vite/deps/react.js'),React=rm.default||rm,cm=await import('/node_modules/.vite/deps/react-dom_client.js');q.React=React;q.root=(cm.createRoot||cm.default.createRoot)(document.body.appendChild(document.createElement('div')));const {FreeModeration}=await import('/src/FreeModeration.tsx');q.root.render(React.createElement(FreeModeration,{onClose:()=>{}}));},place);
 const item=page.locator('article.reported-content').filter({hasText:'Texte à corriger'});
 await item.getByRole('button',{name:'Voir le contenu actuel',exact:true}).click();await item.locator('.reported-place-fields').waitFor();
 for(const value of [place.address,place.city,place.age,place.website,place.description])assert((await item.innerText()).includes(value));
 await page.screenshot({path:'../livraison/apercus-0.1.43/lieu-enregistre.png'});
 await item.getByRole('button',{name:'Modifier le lieu',exact:true}).click();
 const form=page.locator('.edit-dialog');await form.locator('textarea').first().scrollIntoViewIfNeeded();await form.locator('textarea').first().waitFor();assert.equal(await form.locator('textarea').first().inputValue(),place.description);
 assert.equal(await form.getByLabel('Commune',{exact:true}).inputValue(),place.city);
 assert.equal(await form.getByLabel('Site web · facultatif',{exact:true}).inputValue(),place.website);
 assert.equal(await form.getByLabel('Âge conseillé',{exact:true}).inputValue(),place.age);
 assert(await form.getByRole('group',{name:'Jeux clôturés',exact:true}).getByRole('button',{name:'Non',exact:true}).getAttribute('aria-pressed')==='true');
 await form.locator('textarea').first().fill('Texte corrigé uniquement');await page.screenshot({path:'../livraison/apercus-0.1.43/correction-prefilled.png'});
 await form.getByRole('button',{name:'Enregistrer',exact:true}).click();await form.waitFor({state:'hidden',timeout:7000});console.log('Place saved');
 const stored=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data();
 for(const [key,value] of Object.entries(place))if(!['version','description'].includes(key))assert.deepEqual(stored.place[key],value,`Champ altéré : ${key}`);
 assert.equal(stored.place.description,'Texte corrigé uniquement');assert.deepEqual(stored.place,{...place,version:2,description:'Texte corrigé uniquement'});assert.deepEqual(stored.reviews,{other:review});const preservedPhoto=(await getDoc(doc(env.unauthenticatedContext().firestore(),'previews',place.id+'_photo'))).data();assert.equal(preservedPhoto.url,photoUrl);assert.equal(preservedPhoto.caption,'Photo conservée');
 // Une correction ne tronque pas d’anciens champs encore valides, ni n’ajoute de valeurs par défaut.
 const legacy={...place,id:'qa-legacy-043',city:'Commune '+ 'a'.repeat(140),hours:'Mo-Fr 09:00-18:00; '+ 'a'.repeat(510),access:'Accès spécifique enregistré'};
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'shared',legacy.id),{place:legacy,reviews:{},deleted:false,version:1,updated:Timestamp.now(),cell:'183:19',lastOp:'seed',by:'someone',kind:'place.create',lastPhoto:''});await setDoc(doc(db,'reports','qa-legacy-report-043'),{uid:'someone',placeId:legacy.id,reviewId:'',photoId:'',reason:'Texte à corriger',status:'pending',created:Timestamp.now()});});
 await page.evaluate(async id=>{const c=window.qa.cloud;await c.moderateFreeReport('qa-legacy-report-043','edit',await c.getFreeReportedPlace(id),{place:{description:'Corrigé'}});},legacy.id);
 assert.deepEqual((await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',legacy.id))).data().place,{...legacy,description:'Corrigé',version:2});
 // Avis dans l’interface réelle : affichage immédiat hors connexion, puis synchronisation.
 await page.evaluate(async place=>{const q=window.qa;q.root.unmount();q.root=null;localStorage.setItem('map-offline','true');const {Detail}=await import('/src/Detail.tsx'),cm=await import('/node_modules/.vite/deps/react-dom_client.js');q.root=(cm.createRoot||cm.default.createRoot)(document.body.appendChild(document.createElement('div')));q.root.render(q.React.createElement(Detail,{place,aerial:false,origin:{lat:45.75,lon:4.83,name:'Lyon'},pmr:false,onClose:()=>{},onShowMap:()=>{},onLogin:()=>{throw Error('Connexion demandée');},toast:s=>{q.toast=s;}}));},stored.place);
 await page.getByRole('button',{name:'Donner mon avis',exact:true}).click();await page.getByLabel('Votre expérience',{exact:true}).fill('Premier avis QA043');await page.getByRole('button',{name:'Enregistrer mon avis',exact:true}).click();await page.getByRole('button',{name:'Enregistrer mon avis',exact:true}).waitFor({state:'hidden'});await page.getByText('Premier avis QA043',{exact:true}).waitFor();
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');try{await window.qa.sync.runFreeSync();}catch(e){throw Error(`${e.name}: ${e.message} ${e.stack}`);}});await page.getByText('Premier avis QA043',{exact:true}).waitFor();
 console.log('First review visible');const first=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data();assert.equal(first.reviews[uid].text,'Premier avis QA043');
 await page.evaluate(()=>localStorage.setItem('map-offline','true'));
 await page.locator('article.review').filter({hasText:'Premier avis QA043'}).getByRole('button',{name:'Modifier mon avis',exact:true}).click();
 assert.equal(await page.getByLabel('Votre expérience',{exact:true}).inputValue(),'Premier avis QA043');
 await page.getByLabel('Votre expérience',{exact:true}).fill('Avis modifié QA043');await page.getByRole('radio',{name:'3 étoiles',exact:true}).click();
 await page.getByRole('button',{name:'Enregistrer mon avis',exact:true}).click();await page.getByRole('button',{name:'Enregistrer mon avis',exact:true}).waitFor({state:'hidden'});await page.getByText('Avis modifié QA043',{exact:true}).waitFor();
 const pending=await page.evaluate(async id=>window.qa.store.getDetail(id),place.id);
 assert.equal(pending.reviews.filter(r=>r.user_id===uid||r.user_id==='personal-device').length,1);assert.equal(pending.review_count,2);assert.equal(pending.rating,3.5);
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');await window.qa.sync.runFreeSync();});
 const edited=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data();assert.equal(edited.reviews[uid].text,'Avis modifié QA043');assert.equal(Object.keys(edited.reviews).length,2);
 await page.getByText('Avis modifié QA043',{exact:true}).waitFor();assert.equal(await page.locator('article.review').count(),2);console.log('One edited review per author');
 await page.evaluate(()=>localStorage.setItem('map-offline','true'));
 await page.locator('article.review').filter({hasText:'Avis modifié QA043'}).getByRole('button',{name:'Supprimer',exact:true}).click();
 await page.getByRole('dialog',{name:'Supprimer votre avis ?',exact:true}).getByRole('button',{name:'Supprimer',exact:true}).click();
 await page.getByRole('dialog',{name:'Supprimer votre avis ?',exact:true}).waitFor({state:'hidden',timeout:7000});
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');await window.qa.sync.runFreeSync();});
 await page.getByText('Avis modifié QA043',{exact:true}).waitFor({state:'hidden'});console.log('Review deleted');
 await page.evaluate(()=>localStorage.setItem('map-offline','true'));
 await page.getByRole('button',{name:'Donner mon avis',exact:true}).click();await page.getByLabel('Votre expérience',{exact:true}).fill('Nouvel avis QA043');await page.getByRole('button',{name:'Enregistrer mon avis',exact:true}).click();await page.getByRole('button',{name:'Enregistrer mon avis',exact:true}).waitFor({state:'hidden'});await page.getByText('Nouvel avis QA043',{exact:true}).waitFor();
 await page.evaluate(async()=>{localStorage.setItem('map-offline','false');try{await window.qa.sync.runFreeSync();}catch(e){throw Error(`${e.name}: ${e.message} ${e.stack}`);}});await page.getByText('Nouvel avis QA043',{exact:true}).waitFor({timeout:5000});
 const displayed=await page.evaluate(async id=>(await window.qa.store.getDetail(id)).reviews,place.id);assert.equal(displayed.find(r=>r.user_id===uid)?.text,'Nouvel avis QA043','Avis publié masqué par un ancien retrait local');await page.waitForTimeout(250);await page.getByText('Nouvel avis QA043',{exact:true}).waitFor({timeout:5000});
 const last=(await getDoc(doc(env.unauthenticatedContext().firestore(),'shared',place.id))).data();assert.equal(last.reviews[uid].text,'Nouvel avis QA043');
 await page.screenshot({path:'../livraison/apercus-0.1.43/avis-visible.png'});
 // Nettoyage local des avis anciens : garder la modification la plus récente et les autres auteurs.
 await page.evaluate(async place=>{
  const {store}=window.qa;localStorage.setItem('map-offline','true');const duplicate={...place,id:'qa-duplicate-043',rating:4,review_count:3,photo_count:0};
  const base={author:'Alice',user_id:'alice',stars:5,text:'Ancien',votes:0,voters:[],created:'2026-09-17',updated:'2026-09-18'};
  await store.db.places.put(duplicate);await store.db.details.put({...duplicate,photos:[],reviews:[{...base,id:'old',place_id:'source-a'},{...base,id:'recent',place_id:'source-b',stars:3,text:'Récent',updated:'2026-10-02'},{...base,id:'bob',user_id:'bob',stars:4,text:'Autre'}]});
  const cleaned=await store.getDetail(duplicate.id),saved=await store.db.details.get(duplicate.id),p=await store.db.places.get(duplicate.id);
  if(cleaned.reviews.length!==2||cleaned.reviews.find(r=>r.user_id==='alice')?.text!=='Récent'||cleaned.rating!==3.5||saved.reviews.length!==2||p.review_count!==2)throw Error('Nettoyage local incorrect');
 },place);
 assert.deepEqual(errors,[]);const result={moderationCompleteRecord:true,onlyDescriptionChanged:true,otherReviewPreserved:true,photoPreserved:true,legacyFieldsPreservedExactly:true,reviewVisibleOfflineAndOnline:true,recreatedReviewVisible:true,oneReviewPerAuthorOfflineAndOnline:true,legacyDuplicateCacheRepaired:true,errors};writeFileSync('../livraison/apercus-0.1.43/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} catch(e) {const page=browser.contexts()[0]?.pages()[0];if(page){console.log('Failure UI',await page.locator('body').innerText());console.log('State',JSON.stringify(await page.evaluate(async()=>({queue:await window.qa.store.db.freeQueue.toArray(),personal:await window.qa.store.db.personal.toArray(),details:await window.qa.store.db.details.toArray(),sync:window.qa.sync.freeSyncState})),null,2));await page.screenshot({path:'../livraison/apercus-0.1.43/failure.png'});}throw e;} finally {await browser.close();await env.cleanup();}
