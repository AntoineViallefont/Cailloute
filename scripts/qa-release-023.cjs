const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});let page;
 try{
  const context=await browser.newContext({viewport:{width:412,height:915}});page=await context.newPage();
  const errors=[],apiRequests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^http:\/\/127\.0\.0\.1(?::\d+)?\/(?:api\/)?v1\//,r=>{apiRequests.push(r.request().url());return r.abort();});
  // Une ancienne session suspendue ne doit pas empêcher les essais personnels.
  await page.addInitScript(()=>localStorage.setItem('user',JSON.stringify({id:'previous-session',username:'Ancien compte',role:'admin',moderation:{can_contribute:false}})));
  const until=async fn=>{const start=Date.now();while(!await page.evaluate(fn)){if(Date.now()-start>30000)throw Error('Condition non satisfaite');await new Promise(r=>setTimeout(r,150));}};
  const nav=name=>page.getByRole('navigation').getByRole('button',{name,exact:true});
  await page.goto('http://127.0.0.1:5187');
  await until(async()=>{const {db}=await import('/src/store.ts');return !!await db.meta.get('catalog-012');});
  await nav('Profil').click();await page.getByRole('heading',{name:'Mode personnel',exact:true}).waitFor();
  for(const name of ['Se connecter / créer un compte','Signalements et sanctions','Avis signalés','Utilisateurs bloqués'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
  await nav('Contribuer').click();await page.getByRole('textbox',{name:'Nom du lieu · facultatif',exact:true}).fill('Square essai local 023');
  await page.getByRole('button',{name:'Catégorie',exact:true}).click();await page.getByRole('dialog',{name:'Catégorie',exact:true}).getByRole('button',{name:'Aires de jeux',exact:true}).click();
  await context.setOffline(true);
  await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.getByText('Lieu enregistré sur cet appareil.',{exact:true}).waitFor();
  await context.setOffline(false);
  await nav('Carte').click();await page.getByRole('combobox',{name:'Adresse, lieu ou filtre'}).fill('Square essai local 023');await page.getByRole('option').filter({hasText:'Square essai local 023'}).first().click();
  await page.getByRole('button',{name:'Modifier les informations / Photos',exact:true}).click();await page.getByText('Âges, horaires et précisions',{exact:true}).click();
  await page.getByRole('textbox',{name:'Informations utiles',exact:true}).fill('Modification conservée uniquement sur cet appareil.');
  await context.setOffline(true);await page.getByRole('dialog').getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});await page.getByText('Modification conservée uniquement sur cet appareil.',{exact:true}).waitFor();
  await context.setOffline(false);await page.reload();
  const persisted=await page.evaluate(async()=>{const {db,allPlaces,getDetail,enqueue}=await import('/src/store.ts');const p=(await allPlaces()).find(p=>p.name==='Square essai local 023');if(!p)throw Error('Lieu perdu');await enqueue('review.save',p.id,{stars:4,text:'Avis local'});await enqueue('photo.add',p.id,{base64:document.createElement('canvas').toDataURL('image/jpeg').split(',')[1],caption:'Photo locale'});const d=await getDetail(p.id);return {description:d.description,reviews:d.reviews.length,photos:d.photos.length,queue:await db.queue.count(),stats:(await db.meta.get('contribution-stats')).value};});
  assert.equal(persisted.description,'Modification conservée uniquement sur cet appareil.');assert.equal(persisted.reviews,1);assert.equal(persisted.photos,1);assert.equal(persisted.queue,0);
  await nav('Profil').click();fs.mkdirSync('livraison/apercus-0.1.23',{recursive:true});await page.screenshot({path:'livraison/apercus-0.1.23/profil-personnel.png'});
  await page.evaluate(async()=>{const {db,allPlaces,enqueue,sync}=await import('/src/store.ts');const p=(await allPlaces()).find(p=>p.name==='Square essai local 023');await enqueue('place.delete',p.id,{});await sync();if((await allPlaces()).some(x=>x.id===p.id)||await db.personal.get(p.id))throw Error('Suppression non effective');if((await db.meta.get('contribution-stats')).value.added!==1)throw Error('Compteur perdu');});
  assert.deepEqual(apiRequests,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({personalMode:true,offlineCreate:true,offlineEdit:true,reloadPersisted:true,localReviewAndPhoto:true,permanentDelete:true,noSharedApi:true,persisted,errors},null,2));
 }catch(e){if(page){console.error((await page.locator('body').innerText()).slice(-4500));}throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
