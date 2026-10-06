const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"chrome"});const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5187');await page.getByRole('button',{name:/^Filtres/}).waitFor();
 await page.waitForFunction(async()=>{const {db}=await import('/src/store.ts');return (await db.places.count())>10000;},{},{timeout:60000});
 fs.mkdirSync('livraison/apercus-0.1.19',{recursive:true});
 await page.getByRole('button',{name:/^Filtres/}).click();await page.getByRole('button',{name:'Payant',exact:true}).click();await page.screenshot({path:'livraison/apercus-0.1.19/filtres-jour.png'});
 await page.getByRole('dialog').last().getByRole('button',{name:'Fermer',exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Profil',exact:true}).click();
 await page.getByRole('button',{name:'À propos',exact:true}).click();await page.getByText('Photos : les lieux, pas les visages',{exact:true}).click();await page.screenshot({path:'livraison/apercus-0.1.19/a-propos-jour.png'});
 await page.getByRole('dialog').last().getByRole('button',{name:'Fermer',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('theme',JSON.stringify('dark'));document.documentElement.dataset.theme='dark';});
 await page.screenshot({path:'livraison/apercus-0.1.19/profil-nuit.png'});
 const result=await page.evaluate(async()=>{
  const {db,enqueue,saveContribution,eraseLocalPlaces,allPlaces}=await import('/src/store.ts');
  const base={id:'qa-019',version:1,name:'Aire de jeux test',category:'playground',lat:48.8566,lon:2.3522,address:'',city:'Paris',hours:'',description:'',age:'',access:'public',wheelchair:null,changing_table:null,drinking_water:null,free:true,fenced:null,elevator:null,sources:[],rating:null,review_count:0};
  const before=(await db.meta.get('contribution-stats')).value;
  await saveContribution(base.id,{...base,id:undefined,version:undefined,sources:undefined,rating:undefined,review_count:undefined},undefined,undefined,[]);
  await db.favorites.put({id:base.id});await db.details.put({...base,reviews:[],photos:[]});
  await eraseLocalPlaces([base.id]);
  // Simuler un réimport du même lieu : l'exclusion reste effective.
  await db.places.put(base);
  const result={personal:await db.personal.get(base.id),detail:await db.details.get(base.id),favorite:await db.favorites.get(base.id),excluded:!!await db.removed.get(base.id),visible:(await allPlaces()).some(p=>p.id===base.id),stats:(await db.meta.get('contribution-stats')).value,before};
  if(result.personal||result.detail||result.favorite||!result.excluded||result.visible||result.stats.added!==before.added+1)throw new Error(JSON.stringify(result));return result;
 });
 await page.goto('http://127.0.0.1:5187/suppression-compte');await page.getByRole('heading',{name:'Supprimer un compte Cailloute'}).waitFor();
 await page.screenshot({path:'livraison/apercus-0.1.19/suppression-compte.png'});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({status:'ok',storage:result,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
