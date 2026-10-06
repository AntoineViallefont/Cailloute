const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'chrome' });
 const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
 const page = await ctx.newPage(), errors = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.goto('http://127.0.0.1:5187');
 for (let attempt=0; attempt<80; attempt++) { const count=await page.evaluate(async()=>{const{db}=await import('/src/store.ts');return db.places.count();});if(count===14261)break;await page.waitForTimeout(250); }
 assert.equal(await page.locator('.brand').count(), 0);
 const seed = await page.evaluate(async () => {const {db}=await import('/src/store.ts');return { count:await db.places.count(),initial:JSON.stringify(await db.places.get('p_017_sos')) };});
 assert.equal(seed.count, 13692 + 569);
 const search = page.getByRole('combobox',{name:'Adresse, lieu ou filtre'});
 await search.fill('bébé'); await page.getByRole('option').filter({hasText:'Activités'}).first().waitFor();
 await search.fill('SOS'); await page.getByRole('option').filter({hasText:'SOS Médecins Lyon'}).click();
 await page.getByRole('button',{name:'Exactitude des informations'}).waitFor();
 assert.ok((await page.locator('.place-reputation').innerText()).includes('Valide ?'));
 await page.getByRole('button',{name:'Retour'}).click();
 await search.fill('28 quai Rambaud');await page.getByRole('option').filter({hasText:'Adresse'}).first().waitFor({timeout:20000});
 await search.fill(''); await search.blur();
 await page.getByRole('button',{name:/^Filtres/}).click();
 const slider=page.getByRole('slider'); const width=await slider.evaluate(e=>e.getBoundingClientRect().width), parent=await slider.evaluate(e=>e.parentElement.getBoundingClientRect().width);assert.ok(width/parent>.98);
 await slider.fill('0');assert.equal(await slider.getAttribute('aria-valuetext'),'100 m');await slider.fill('1000');assert.equal(await slider.getAttribute('aria-valuetext'),'30 km');
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 // Créer des données personnelles et conserver un favori de chaque catégorie.
 await page.evaluate(async()=>{
  const {db,enqueue,addPhotos,allPlaces,favorite}=await import('/src/store.ts');
  const base=(await allPlaces()).find(p=>p.id==='p_017_sos');
  await enqueue('place.create','c_017_test',{...base,name:'Atelier QA photos',category:'child_activity',lat:45.7578,lon:4.832,description:'Atelier parent enfant',sources:[],community:true});
  const photos=[];
  for(const [w,h,color] of [[600,1000,'#34aa99'],[1200,700,'#aa7733'],[900,900,'#3344aa']]) {const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);x.fillStyle='#fff';x.font='60px sans-serif';x.fillText('Photo '+(photos.length+1),30,100);photos.push({base64:c.toDataURL('image/jpeg').split(',')[1],caption:''});}
  await addPhotos('c_017_test',photos);
  await favorite((await allPlaces()).find(p=>p.id==='c_017_test'));await favorite(base);
 });
 await page.getByRole('button',{name:'Favoris',exact:true}).click();assert.equal(await page.locator('.map-favorites-label').count(),0);
 await page.getByRole('button',{name:'Liste',exact:true}).click();await page.getByText('Atelier QA photos',{exact:true}).waitFor();
 assert.ok((await page.locator('.place-row').filter({hasText:'Atelier QA photos'}).innerText()).includes('0 avis'));
 assert.equal(await page.locator('.place-row').filter({hasText:'Atelier QA photos'}).locator('.star').getAttribute('fill'),'none');
 await page.getByRole('button',{name:/^Filtres/}).click();await page.getByRole('button',{name:'Activités',exact:true}).click();await page.getByRole('button',{name:'Fermer',exact:true}).click();assert.equal(await page.getByText('Atelier QA photos',{exact:true}).count(),0);assert.equal(await page.locator('.place-row').count(),1);
 await page.getByRole('button',{name:/^Filtres/}).click();await page.getByRole('button',{name:'Activités',exact:true}).click();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByText('Atelier QA photos',{exact:true}).click();
 const photos=page.locator('.featured-photos img');await photos.first().waitFor();await photos.first().evaluate(img=>img.decode());
 const dims=await photos.evaluateAll(images=>images.map(i=>({w:i.clientWidth,h:i.clientHeight,nw:i.naturalWidth,nh:i.naturalHeight})));for(const d of dims)assert.ok(Math.abs(d.w/d.h-d.nw/d.nh)<.02);
 await page.screenshot({path:'livraison/apercus-0.1.7/fiche-photos.png'});
 await page.getByRole('button',{name:'Agrandir la photo de Atelier QA photos'}).first().click();await page.getByRole('dialog',{name:'Photos',exact:true}).waitFor();
 assert.equal(await page.locator('.photo-hint').count(),0);assert.equal(await page.locator('.photo-place-name').innerText(),'Atelier QA photos');
 const cdp=await ctx.newCDPSession(page);const box=await page.locator('.photo-canvas').boundingBox();const cy=box.y+box.height/2;
 async function touch(type,points){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});}
 await touch('touchStart',[[330,cy]]);await touch('touchMove',[[200,cy]]);await touch('touchMove',[[75,cy]]);await touch('touchEnd',[]);await page.getByText('2 / 3',{exact:true}).waitFor();
 for(let i=0;i<2;i++){await touch('touchStart',[[200,cy]]);await touch('touchEnd',[]);await page.waitForTimeout(70);}await page.waitForFunction(()=>Number(document.querySelector('.photo-canvas').dataset.zoom)>2);
 await touch('touchStart',[[330,cy]]);await touch('touchMove',[[100,cy]]);await touch('touchEnd',[]);assert.equal(await page.getByText('2 / 3',{exact:true}).count(),1);
 await page.screenshot({path:'livraison/apercus-0.1.7/photo-zoom.png'});
 await page.getByRole('dialog',{name:'Photos',exact:true}).getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('button',{name:'Retour'}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Carte',exact:true}).click();await page.locator('.view-toggle').click();
 await page.getByRole('button',{name:'Passer à la vue aérienne'}).click();await page.waitForFunction(()=>document.querySelectorAll('canvas.leaflet-tile-loaded').length>30);
 await page.getByRole('button',{name:'Carte hors ligne'}).click();await page.getByRole('button',{name:'Enregistrer la zone affichée'}).click();await page.getByText(/Zone enregistrée ·/).waitFor({timeout:90000});
 await page.getByLabel('Utiliser uniquement les cartes enregistrées').check();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 let mapRequests=0;page.on('request',r=>{if(r.url().includes('/wmts?'))mapRequests++;});
 // Le mode hors ligne interdit toute requête de tuile, même après réouverture de la carte.
 await page.getByRole('button',{name:'Liste',exact:true}).click();await page.locator('.view-toggle').click();await page.waitForTimeout(1500);assert.equal(mapRequests,0);assert.ok(await page.locator('canvas.leaflet-tile-loaded').count()>20);
 await page.getByRole('button',{name:'Choisir le thème'}).click();await page.getByRole('button',{name:'Nuit',exact:true}).click();await page.screenshot({path:'livraison/apercus-0.1.7/carte-nuit-hors-ligne.png'});
 const preserved=await page.evaluate(async()=>{const{db,boot}=await import('/src/store.ts');const before=JSON.stringify(await db.personal.toArray());await db.meta.delete('catalog-017');await boot();return{personal:before===JSON.stringify(await db.personal.toArray()),count:await db.places.count(),base:JSON.stringify(await db.places.get('p_017_sos'))};});
 assert.equal(preserved.personal,true);assert.equal(preserved.count,seed.count);assert.equal(preserved.base,seed.initial);
 assert.deepEqual(errors,[]);console.log('OK : recherche, favoris filtrés, rayon, photos/swipe/zoom, cache hors ligne, réimport non destructif.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
