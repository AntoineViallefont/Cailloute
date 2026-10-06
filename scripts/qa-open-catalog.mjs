/** Vérification des compléments réels et d'une correction, entièrement locale. */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {enrichmentServer} from './open-enrichment-server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const {chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const data=JSON.parse(await readFile(resolve(root,'donnees/enrichissement-ouvert/candidates.json')));
const rows=data.candidates.filter(c=>c.patch.description).slice(0,4);
const server=await enrichmentServer(undefined,5194),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:5194/exemple-enrichissement.html');
 const result=await page.evaluate(async rows=>{
  const store=await import('/src/store.ts');await store.db.places.bulkPut(rows.map(c=>c.place));let verified=0;
  for(const row of rows){const detail=await store.getDetail(row.place.id);for(const [key,value]of Object.entries(row.patch))if(detail[key]!==value)throw Error('Complément absent : '+key);verified++;}
  const row=rows[0],recorded=await store.getDetail(row.place.id);
  await store.enqueue('place.edit',row.place.id,{...recorded,description:'Texte corrigé par la communauté'});
  const changed=await store.getDetail(row.place.id);
  if(changed.description!=='Texte corrigé par la communauté')throw Error('Correction écrasée');
  for(const key of ['name','lat','lon','category','website','hours','wheelchair'])if(changed[key]!==recorded[key])throw Error('Autre champ modifié : '+key);
  return{loadedPlaces:verified,communityCorrectionPreserved:true,otherFieldsPreserved:true};
 },rows);
 assert(!requests.some(url=>url.includes('firestore.googleapis.com')));
 const paths=requests.filter(url=>url.includes('/enrichment/')).map(url=>new URL(url).pathname);
 const output={...result,regionalFilesRead:paths,firestoreCalls:0};
 await writeFile(resolve(root,'livraison/apercus-enrichissement/tests-catalogue.json'),JSON.stringify(output,null,2)+'\n');console.log(output);
}finally{await browser.close();await server.close();}
