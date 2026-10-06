const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try {
const page=await browser.newPage(); await page.route('**/__preview_qa',route=>route.fulfill({contentType:'text/html',body:'<html><body>Test aperçus</body></html>'}));await page.goto('http://127.0.0.1:5187/__preview_qa');
console.log(JSON.stringify(await page.evaluate(async()=>{
 const {preparePrivatePhoto}=await import('/src/photo-privacy.ts');
 const {preparePhoto,prepareSharedPreview}=await import('/src/photo-input.ts');
 const results=[];
 for(const [width,height] of [[4000,3000],[1000,2000],[50,40]]) {
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(width,height);const data=new Uint32Array(pixels.data.buffer);let seed=42;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=0xff000000|(seed&0xffffff);}ctx.putImageData(pixels,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.9));
 const start=performance.now();const photo=await preparePrivatePhoto(blob); const ms=Math.round(performance.now()-start);
 const output=await (await fetch('data:image/jpeg;base64,'+photo.prepared.base64)).blob();const bitmap=await createImageBitmap(output);
 if(output.size>20480||Math.max(bitmap.width,bitmap.height)>320||photo.reviewed)throw Error('Aperçu invalide');
 const masked=await preparePhoto(photo.original,undefined,[{x:0,y:0,width:1,height:1}]);const revalidated=await prepareSharedPreview(masked.base64);
 if(atob(revalidated.base64).length>20480)throw Error('Masque trop grand');
 results.push({input:[width,height],output:[bitmap.width,bitmap.height],bytes:output.size,ms,reviewRequired:!photo.reviewed});bitmap.close();
 }
 return results;
}),null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
