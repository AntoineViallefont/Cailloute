const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:412,height:915}});
  await page.goto('http://127.0.0.1:5187');
  await page.getByRole('navigation').waitFor();
  await page.getByRole('button',{name:'Continuer sans compte',exact:true}).click();
  assert.equal(await page.locator('#launch-screen').count(),0);
  await page.getByRole('button',{name:'Activer le mode hors connexion',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('map-offline')),'true');
  await page.getByRole('button',{name:'Désactiver le mode hors connexion',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('map-offline')),'false');
  const report=await page.evaluate(async()=>{
   const {preparePhoto,convertPhotoUrl,photoDataUrl}=await import('/src/photo-input.ts');
   const {db,compressStoredPhotos}=await import('/src/store.ts');
   const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200;
   const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);
   let seed=12345;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>8)&255;pixels.data[i+2]=(seed>>16)&255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);
   const jpeg=canvas.toDataURL('image/jpeg',.9);
   const prepared=await preparePhoto(await (await fetch(jpeg)).blob());
   const url=photoDataUrl(prepared.base64),blob=await (await fetch(url)).blob(),image=await createImageBitmap(blob);
   const result={mime:blob.type,bytes:blob.size,width:image.width,height:image.height};image.close();
   const existing=await db.places.toCollection().first();
   const photo={id:'qa-old-photo',place_id:existing.id,url:jpeg,caption:'Légende préservée',created:'2026-09-01',user_id:'qa'};
   await db.personal.put({id:'qa-personal',base:{...existing,id:'qa-personal'},patch:{},photos:[photo],removedReviews:[],removedPhotos:[],updated:'2026-09-01'});
   await db.details.put({...existing,id:'qa-detail',photos:[photo],reviews:[]});
   await db.meta.put({key:'profile-avatar:qa',value:jpeg});
   const operation={id:'qa-op',kind:'photo.add',place_id:existing.id,payload:{base64:jpeg.split(',')[1],caption:'Queue'}};
   await db.freeQueue.put({id:operation.id,owner:'qa',operation,created:0,status:'pending'});
   await compressStoredPhotos();
   const rows=[(await db.personal.get('qa-personal')).photos[0].url,(await db.details.get('qa-detail')).photos[0].url,(await db.meta.get('profile-avatar:qa')).value,photoDataUrl((await db.freeQueue.get('qa-op')).operation.payload.base64)];
   result.migrated=[];for(const value of rows){const b=await(await fetch(value)).blob();result.migrated.push({mime:b.type,bytes:b.size});}
   result.caption=(await db.personal.get('qa-personal')).photos[0].caption;
   result.idempotent=await convertPhotoUrl(rows[0])===rows[0];
   return result;
  });
  assert.equal(report.mime,'image/webp');assert(report.bytes<=40000);assert(report.width<=960&&report.height<=960);
  assert(report.migrated.every(p=>p.mime==='image/webp'&&p.bytes<=40000));assert(report.idempotent);assert.equal(report.caption,'Légende préservée');
  const dir='livraison/apercus-0.1.37';fs.mkdirSync(dir,{recursive:true});
  await page.getByRole('navigation').getByRole('button',{name:'Contribuer',exact:true}).click();
  await page.screenshot({path:dir+'/formulaire-jour.png'});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:dir+'/formulaire-nuit.png'});
  fs.writeFileSync(dir+'/validation-webp.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
