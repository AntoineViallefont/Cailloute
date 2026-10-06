const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {spawn,execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'cailloute-022-'));
 const env={...process.env,PYTHONPATH:path.join(root,'backend'),DATABASE_URL:'sqlite:///'+path.join(temp,'test.db'),DATA_DIR:temp,ENVIRONMENT:'test'};
 const python=path.join(root,'backend/.venv/bin/python');
 execFileSync(python,['-c',`from cailloute.db import *
from cailloute.security import password_hash
from cailloute.community import TERMS_VERSION
init()
with Session.begin() as s:
 for name in ['auteur','lecteur','editeur']:
  s.add(User(id=name,username=name,password=password_hash('qa-test-only-password'),created=now(),role='admin' if name=='editeur' else 'member'))
 s.flush()
 for name in ['auteur','lecteur','editeur']:s.add(TermsAcceptance(user_id=name,version=TERMS_VERSION))
 p=Place(id='qa-place',version=1,data={'name':'Square QA Communauté','category':'toilet','lat':45.7578,'lon':4.832,'city':'Lyon','address':'','hours':'','description':'','access':'public','sources':[],'community':True,'license_verified':True,'free':True,'rating':2,'review_count':1},override={});s.add(p);emit(s,p)
 s.add(Review(id='qa-review',place_id=p.id,user_id='auteur',stars=2,text='Avis témoin de la communauté',created=now(),updated=now()))
`],{env});
 const server=spawn(python,['-m','uvicorn','cailloute.main:app','--host','127.0.0.1','--port','8792','--no-access-log'],{env,stdio:'ignore'});
 let browser, qaPage;
 try{
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8792/v1/auth/options')).ok)break;}catch{} await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const errors=[];const context=await browser.newContext({viewport:{width:412,height:915}});
  const page=await context.newPage();qaPage=page;page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('server','http://127.0.0.1:8792'));
  const folder='livraison/apercus-0.1.22';fs.mkdirSync(folder,{recursive:true});
  const nav=name=>page.getByRole('navigation').getByRole('button',{name,exact:true});
  const close=()=>page.getByRole('dialog').last().getByRole('button',{name:'Fermer',exact:true}).click();
  const until=async fn=>{const start=Date.now();while(!await page.evaluate(fn)){if(Date.now()-start>30000)throw Error('Condition non satisfaite '+fn);await new Promise(r=>setTimeout(r,200));}};
  const login=async username=>{await nav('Profil').click();await page.getByRole('button',{name:'Se connecter / créer un compte',exact:true}).click();await page.getByText('Compte avec pseudonyme et mot de passe',{exact:true}).click();await page.getByRole('textbox',{name:'Pseudonyme',exact:true}).fill(username);await page.locator('input[autocomplete="current-password"]').fill('qa-test-only-password');await page.getByRole('dialog').getByRole('button',{name:'Se connecter',exact:true}).click();await until(()=>!document.querySelector('dialog[open]'));};
  const closePlace=async()=>{const handle=page.locator('.sheet-handle');if(await handle.count()){await handle.focus();await page.keyboard.press('Escape');await page.locator('.place-sheet').waitFor({state:'detached'});}};
  const logout=async()=>{await closePlace();await nav('Profil').click();await page.getByRole('button',{name:'Se déconnecter',exact:true}).click();await page.getByRole('button',{name:'Se connecter / créer un compte',exact:true}).waitFor();};
  const openPlace=async()=>{await nav('Carte').click();await page.getByRole('combobox',{name:'Adresse, lieu ou filtre'}).fill('Square QA Communauté');await page.getByRole('option').filter({hasText:'Square QA Communauté'}).first().click();await page.getByText('Avis témoin de la communauté',{exact:true}).waitFor();};
  await page.goto('http://127.0.0.1:5187');await nav('Contribuer').click();await page.getByRole('dialog',{name:'Se connecter',exact:true}).waitFor();await close();
  await login('lecteur');await openPlace();
  await page.getByRole('button',{name:'Options pour auteur',exact:true}).click();await page.getByRole('button',{name:'Bloquer pour moi',exact:true}).click();
  await until(()=>!document.body.textContent.includes('Avis témoin de la communauté'));
  await closePlace();await nav('Profil').click();await page.getByRole('button',{name:/Utilisateurs bloqués/}).click();await page.getByText('auteur',{exact:true}).waitFor();await page.screenshot({path:`${folder}/utilisateurs-bloques.png`});
  await page.getByRole('button',{name:'Débloquer',exact:true}).click();await page.getByText('Aucun utilisateur bloqué.',{exact:true}).waitFor();await close();
  await openPlace();await page.getByRole('button',{name:'Options pour auteur',exact:true}).click();await page.getByRole('button',{name:'Signaler cet utilisateur',exact:true}).click();
  await page.getByRole('combobox',{name:/^Motif/}).selectOption('harassment');await page.getByRole('textbox',{name:'Décrivez le problème'}).fill('Comportement abusif répété à examiner.');await page.screenshot({path:`${folder}/signaler-utilisateur.png`});await page.getByRole('button',{name:'Envoyer le signalement',exact:true}).click();await page.getByText('Signalement transmis à l’éditeur.',{exact:true}).waitFor();
  await logout();await login('editeur');await page.getByRole('button',{name:'Signalements et sanctions',exact:true}).click();await page.getByRole('combobox',{name:/^Décision/}).selectOption('suspend_7');await page.getByRole('textbox',{name:'Motif de la décision'}).fill('Harcèlement confirmé après examen.');await page.screenshot({path:`${folder}/decision-editeur.png`});await page.getByRole('button',{name:'Appliquer la décision',exact:true}).click();
  const confirm=page.getByRole('dialog').last();await confirm.getByRole('button',{name:'Confirmer',exact:true}).click();await page.getByRole('button',{name:'Lever la suspension',exact:true}).waitFor();await close();
  await logout();await login('auteur');await page.getByRole('button',{name:'Contester cette décision',exact:true}).click();await page.getByRole('textbox',{name:'Votre contestation'}).fill('Je souhaite présenter des éléments qui expliquent ce contenu.');await page.getByRole('button',{name:'Envoyer à l’éditeur',exact:true}).click();await page.getByText('Contestation envoyée, en attente d’examen.',{exact:true}).waitFor();await page.screenshot({path:`${folder}/suspension-contestation.png`});
  await logout();await login('editeur');await page.getByRole('button',{name:'Signalements et sanctions',exact:true}).click();await page.getByRole('button',{name:'Examiner la contestation',exact:true}).click();await page.getByRole('combobox',{name:/^Décision/}).selectOption('true');await page.getByRole('textbox',{name:'Réponse au contributeur'}).fill('Après vérification, les contributions sont rétablies.');await page.getByRole('button',{name:'Enregistrer la réponse',exact:true}).click();await page.getByText('Aucune suspension active.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({guestReadOnly:true,privateBlock:true,unblock:true,authorReport:true,editorSuspension:true,appeal:true,restore:true,realTemporaryBackend:true,errors},null,2));
 }catch(e){if(qaPage){await qaPage.screenshot({path:'livraison/apercus-0.1.22/failure.png'});console.error((await qaPage.locator('body').innerText()).slice(-7000));}throw e;}finally{if(browser)await browser.close();server.kill();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
