const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:412,height:915}});await page.goto('http://127.0.0.1:5187');
 const result=await page.evaluate(async()=>{
  const {preparePrivatePhoto}=await import('/src/photo-privacy.ts');const {warmHeadDetector,releaseHeadDetector}=await import('/src/head-detection-client.ts');
  const timings=[];
  for(const size of [1200,4000]){
   const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size*0.75;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(canvas.width,canvas.height);const data=new Uint32Array(pixels.data.buffer);let seed=42;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=0xff000000|(seed&0xffffff);}ctx.putImageData(pixels,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.9));
   warmHeadDetector();await new Promise(r=>setTimeout(r,1000));
   for(let i=0;i<2;i++){const start=performance.now();const photo=await preparePrivatePhoto(blob);timings.push({size,ms:Math.round(performance.now()-start),incomplete:photo.detectionFailed,bytes:Math.floor(photo.prepared.base64.length*3/4),reviewed:photo.reviewed});if(photo.prepared.base64.length*3/4>200002)throw Error('Photo trop lourde');}
   releaseHeadDetector();
  }
  const controller=new AbortController();controller.abort();let cancelled=false;try{await preparePrivatePhoto(new Blob(),undefined,controller.signal);}catch(e){cancelled=e.name==='AbortError';}
  return {timings,cancelled};
 });assert(result.cancelled);console.log(JSON.stringify(result,null,2));fs.mkdirSync('livraison/apercus-0.1.24',{recursive:true});fs.writeFileSync('livraison/apercus-0.1.24/photo-timings.json',JSON.stringify(result,null,2));
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
