const {chromium}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"}); const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:5187');await page.waitForFunction(()=>!document.getElementById('launch-screen'));await page.waitForTimeout(500);
 console.log('PAGE', (await page.locator('body').innerText()).slice(0,2500));
 assert.deepEqual(requests.filter(r=>/bootstrap|\/v1\/sync/.test(r)),[]);
 await page.getByRole('button',{name:/^Filtres/}).click();await page.getByRole('button',{name:'Activités',exact:true}).waitFor();
 const slider=page.getByRole('slider',{name:'Distance maximale'});console.log('SLIDER',await slider.getAttribute('min'),await slider.getAttribute('max'));await slider.fill('100');
 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('button',{name:'Contribuer',exact:true}).click();
 await page.getByLabel('Nom du lieu',{exact:true}).fill('Atelier test bébé');await page.getByRole('combobox').first().selectOption('child_activity');await page.getByRole('button',{name:'Continuer',exact:true}).click();
 console.log('FORM',await page.getByRole('dialog').innerText());
 await page.getByLabel('Activité',{exact:true}).fill('Bébé gym');await page.getByLabel('Petit descriptif').fill('Atelier parent enfant');await page.getByLabel('Site web').fill('https://example.org/atelier');
 await page.getByRole('button',{name:'Ajouter des photos',exact:true}).click();
 const images=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=Math.random()*255;pixels.data[i+1]=Math.random()*255;pixels.data[i+2]=Math.random()*255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png').split(',')[1];});
 await page.getByRole('dialog').last().locator('input[multiple]').setInputFiles([{name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(images,'base64')},{name:'portrait2.png',mimeType:'image/png',buffer:Buffer.from(images,'base64')}]);
 await page.getByRole('button',{name:'Ajouter 2 photos',exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'Ajouter 2 photos',exact:true}).click();
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.waitForTimeout(300);
 const state=await page.evaluate(async()=>{const {db,allPlaces}=await import('/src/store.ts');const changes=await db.personal.toArray();return {change:changes[0],places:(await allPlaces()).filter(p=>p.name==='Atelier test bébé'),baseCount:await db.places.count()};});
 assert.equal(state.change.photos.length,2);assert.ok(state.change.photos.every(p=>Buffer.from(p.url.split(',')[1],'base64').length<=200000));
 console.log('SAVED',{photos:state.change.photos.map(p=>Buffer.from(p.url.split(',')[1],'base64').length),name:state.places[0].name,baseCount:state.baseCount});
 await page.getByRole('button',{name:'Profil',exact:true}).click();await page.getByRole('button',{name:/Mes lieux ajoutés ou modifiés/}).click();await page.getByRole('button',{name:/Atelier test bébé/}).click();
 await page.getByRole('button',{name:'Exactitude des informations'}).click();await page.getByRole('button',{name:'Informations exactes',exact:true}).click();await page.waitForTimeout(200);
 await page.getByRole('button',{name:'Exactitude des informations'}).getByRole('img',{name:/Informations validées/}).waitFor();
 await page.getByRole('button',{name:'Donner mon avis',exact:true}).click();await page.getByRole('radio',{name:'4 étoiles'}).click();await page.getByRole('button',{name:'Enregistrer mon avis'}).click();
 await page.getByRole('link',{name:'Site de l’activité'}).waitFor();
 if(/Conditions d’accès à vérifier|Non renseigné|Abri/.test(await page.locator('.detail-scroll').innerText()))throw Error('Unknown info shown');
 fs.mkdirSync('livraison/apercus-0.1.6',{recursive:true});await page.screenshot({path:'livraison/apercus-0.1.6/fiche-jour.png'});
 await page.locator('.featured-photos .photo-preview').first().click();await page.waitForTimeout(150);const box=await page.locator('.photo-canvas').boundingBox();
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);console.log('ZOOM MOUSE',await page.locator('.photo-canvas').getAttribute('data-zoom'));
 await page.screenshot({path:'livraison/apercus-0.1.6/photo-zoom.png'});
 await page.getByRole('button',{name:'Photo suivante'}).click();console.log('RESET',await page.locator('.photo-canvas').getAttribute('data-zoom'));
 // Touch gestures through Chrome's native input protocol.
 const cdp=await context.newCDPSession(page);const cx=box.x+box.width/2,cy=box.y+box.height/2;
 const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 for(let i=0;i<2;i++){await touch('touchStart',[{x:cx,y:cy,id:1}]);await touch('touchEnd',[]);await page.waitForTimeout(60);}
 assert.equal(await page.locator('.photo-canvas').getAttribute('data-zoom'),'2.5');console.log('Double appui : OK');
 await touch('touchStart',[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]);await touch('touchMove',[{x:cx-70,y:cy,id:1},{x:cx+70,y:cy,id:2}]);await touch('touchEnd',[]);await page.waitForTimeout(100);
 assert.ok(Number(await page.locator('.photo-canvas').getAttribute('data-zoom'))>4);console.log('Pincement : OK');
 await touch('touchStart',[{x:cx,y:cy,id:1}]);await touch('touchMove',[{x:cx-60,y:cy-100,id:1}]);await touch('touchEnd',[]);console.log('SCROLL',await page.locator('.photo-canvas').evaluate(n=>({x:n.scrollLeft,y:n.scrollTop})));
 await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.getByRole('button',{name:'Retour',exact:true}).click();await page.getByRole('button',{name:'Applications d’itinéraire'}).click();await page.getByRole('button',{name:/À pied/}).click();await page.getByRole('button',{name:'Google Maps',exact:true}).click();await page.getByRole('button',{name:'Toujours',exact:true}).click();console.log('NAV',await page.getByRole('dialog').innerText());await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('button',{name:'Choisir le thème'}).click();await page.getByRole('button',{name:'Nuit',exact:true}).click();
 await page.getByRole('button',{name:/Mes lieux ajoutés ou modifiés/}).click();await page.screenshot({path:'livraison/apercus-0.1.6/profil-nuit.png'});

 await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Carte',exact:true}).click();await page.getByRole('button',{name:'Liste',exact:true}).click();
 await page.getByRole('button',{name:/^Filtres/}).click();for(const name of ['Aires de jeux','Toilettes','Points d’eau','Magasins bébé','Alimentation','Transports'])await page.getByRole('button',{name,exact:true}).click();await page.getByRole('button',{name:'Fermer',exact:true}).click();
 await page.locator('.place-row').filter({hasText:'Atelier test bébé'}).getByText(/4\/5/).waitFor();
 await page.screenshot({path:'livraison/apercus-0.1.6/liste-nuit.png'});
 const migration=await page.evaluate(async()=>{
   const {db,compressStoredPhotos,allPlaces}=await import('/src/store.ts');const original=(await db.personal.toArray())[0];
   const src=document.createElement('canvas');src.width=1200;src.height=1600;const ctx=src.getContext('2d');const data=ctx.createImageData(1200,1600);for(let i=0;i<data.data.length;i+=4){data.data[i]=Math.random()*255;data.data[i+1]=Math.random()*255;data.data[i+2]=Math.random()*255;data.data[i+3]=255;}ctx.putImageData(data,0,0);
   original.photos[0].url=src.toDataURL('image/jpeg',.98);const before=original.photos[0].url.length;
   await db.personal.put(original);await compressStoredPhotos();const after=await db.personal.get(original.id);
   return {before,after:after.photos[0].url.length,metadata:after.photos[0].created===original.photos[0].created,baseCount:await db.places.count(),rating:(await allPlaces()).find(p=>p.id===original.id).rating};
 });assert.ok(migration.before>300000);assert.ok(migration.after<267000);assert.equal(migration.metadata,true);assert.equal(migration.baseCount,state.baseCount);assert.equal(migration.rating,4);
 await page.reload();await page.waitForFunction(()=>!document.getElementById('launch-screen'));assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('navigation:walking')).id),'google');

 await page.getByRole('button',{name:'Profil',exact:true}).click();await page.getByRole('button',{name:/Mes lieux ajoutés ou modifiés/}).click();await page.getByRole('button',{name:/Atelier test bébé/}).click();
 await page.getByRole('button',{name:'Modifier les informations',exact:true}).click();await page.getByRole('button',{name:'Supprimer le lieu',exact:true}).click();
 const beforeDeletion=await page.evaluate(async()=>{const {allPlaces}=await import('/src/store.ts');return (await allPlaces()).find(p=>p.name==='Atelier test bébé').deleted;});assert.ok(!beforeDeletion);
 await page.getByRole('button',{name:'Confirmer la suppression',exact:true}).click();
 const afterDeletion=await page.evaluate(async()=>{const {allPlaces,db}=await import('/src/store.ts');return {deleted:(await allPlaces()).find(p=>p.name==='Atelier test bébé').deleted,baseCount:await db.places.count()};});assert.equal(afterDeletion.deleted,true);assert.equal(afterDeletion.baseCount,state.baseCount);
 assert.deepEqual(errors,[]);console.log('Migration, note en liste, confirmation de suppression et persistance : OK');await browser.close(); if(errors.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
