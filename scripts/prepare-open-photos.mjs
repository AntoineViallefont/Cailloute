/** Réutilise l'encodeur et le détecteur embarqués, sans API distante d'analyse. */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {availableParallelism} from 'node:os';
import {enrichmentServer} from './open-enrichment-server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),folder=resolve(root,'donnees/enrichissement-ouvert');
const require=createRequire(import.meta.url);
const cacheOnly=process.argv.includes('--cache-only');
const {chromium}=require(process.env.CAILLOUTE_PLAYWRIGHT_MODULE||resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server=await enrichmentServer(folder,5192),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const data=JSON.parse(await readFile(resolve(folder,'candidates.json'),'utf8'));
 const candidates=data.candidates.filter(c=>c.photo),results=[];
 await mkdir(resolve(folder,'photos'),{recursive:true});
 await mkdir(resolve(folder,'processed'),{recursive:true});
 let nextIndex=0,checkpoint=Promise.resolve();
 const save=()=>{const json=JSON.stringify(data,null,2)+'\n';checkpoint=checkpoint.then(async()=>{const file=resolve(folder,'candidates.part');await writeFile(file,json);await rename(file,resolve(folder,'candidates.json'));});return checkpoint;};
 const pages=await Promise.all(Array.from({length:Math.min(4,Math.max(1,availableParallelism()-2))},()=>browser.newPage()));
 for(const page of pages)await page.goto('http://127.0.0.1:5192/exemple-enrichissement.html');
 async function worker(page){
  for(;;){
   const candidate=candidates[nextIndex++];if(!candidate)break;
   const photo=candidate.photo;
   const cacheFile=resolve(folder,'processed',`${photo.originalSha256}.json`);
   if(!photo.finalFile){try{Object.assign(photo,JSON.parse(await readFile(cacheFile,'utf8')));}catch{/* Première préparation de cet original. */}}
   if(photo.finalFile&&photo.detectionComplete){
    try{const cached=await readFile(resolve(folder,photo.finalFile));if(cached.length<=40000&&createHash('sha256').update(cached).digest('hex')===photo.finalSha256){results.push({placeId:candidate.place.id,name:candidate.place.name,bytes:cached.length,faces:photo.masks?.length||0,cached:true});continue;}}catch{/* Refaire une copie absente. */}
   }
   const result=await page.evaluate(async path=>{
    const {preparePhotoCopy}=await import('/src/photo-input.ts');
    const {detectHeads}=await import('/src/head-detection-client.ts');
    try{
     const response=await fetch('/__open/'+path);if(!response.ok)throw new Error('Original indisponible');
     const work=await preparePhotoCopy(await response.blob(),undefined,[],undefined,960,200000);
     const detection=await detectHeads(work.blob,undefined,undefined,60000);
     if(detection.incomplete)throw new Error('Analyse incomplète : photo exclue');
     const final=await preparePhotoCopy(work.blob,undefined,detection.masks);
     return {base64:final.prepared.base64,bytes:final.blob.size,masks:detection.masks,mime:final.blob.type};
    }catch(error){return {error:error.message};}
   },photo.originalFile);
   if(result.error){photo.status='excluded';photo.error=result.error;results.push({placeId:candidate.place.id,name:candidate.place.name,error:result.error});}
   else{
    const bytes=Buffer.from(result.base64,'base64');
    if(result.mime!=='image/webp'||bytes.length>40000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)!==bytes.length-8)throw new Error('Format de photo non conforme');
    const sha=createHash('sha256').update(bytes).digest('hex'),file=`photos/${sha}.webp`;
    await writeFile(resolve(folder,file),bytes);
    Object.assign(photo,{finalFile:file,finalSha256:sha,bytes:bytes.length,masks:result.masks,detectionComplete:true,status:'pending-review'});delete photo.error;
    await writeFile(cacheFile,JSON.stringify({finalFile:file,finalSha256:sha,bytes:bytes.length,masks:result.masks,detectionComplete:true,status:'pending-review'}));
    results.push({placeId:candidate.place.id,name:candidate.place.name,bytes:bytes.length,faces:result.masks.length});
   }
   if(results.length%25===0){if(!cacheOnly)await save();console.log(JSON.stringify({processed:results.length,total:candidates.length}));}
  }
 }
 await Promise.all(pages.map(worker));if(!cacheOnly)await save();
 const report={date:new Date().toISOString(),count:results.length,photos:results,firebaseCalls:0};
 if(!cacheOnly)await writeFile(resolve(folder,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({processed:results.length,ready:results.filter(r=>!r.error).length,faces:results.reduce((n,r)=>n+(r.faces||0),0),maxBytes:Math.max(...results.map(r=>r.bytes||0)),firebaseCalls:0}));
}finally{await browser.close();await server.close();}
