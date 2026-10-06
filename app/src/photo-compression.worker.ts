// Seule la copie déjà masquée traverse ce worker ; aucune photo brute n’est publiée.
self.onmessage=async(event:MessageEvent<{blob:Blob}>)=>{
 let image:ImageBitmap|undefined;
 try{
  image=await createImageBitmap(event.data.blob);
  let scale=Math.min(1,960/Math.max(image.width,image.height));
  for(let attempt=0;attempt<12;attempt++){
   const canvas=new OffscreenCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
   const context=canvas.getContext('2d');if(!context)throw Error('Compression indisponible.');
   context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
   const encode=(quality:number)=>canvas.convertToBlob({type:'image/webp',quality});
   let result=await encode(.9);if(result.type!=='image/webp')throw Error('Encodage WebP indisponible.');
   if(result.size>40000){
    let low=.45,high=.9;result=await encode(low);
    if(result.size>40000){scale*=.8;continue;}
    for(let i=0;i<5;i++){const quality=(low+high)/2,candidate=await encode(quality);if(candidate.size<=40000){low=quality;result=candidate;}else high=quality;}
   }
   self.postMessage({blob:result});return;
  }
  throw Error('Impossible de compresser cette photo.');
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Compression impossible.'});}
 finally{image?.close();}
};
