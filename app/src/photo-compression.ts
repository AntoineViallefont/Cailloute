import {preparePhoto,PHOTO_TARGET_BYTES,type PreparedPhoto} from './photo-input';
import {photoTask,checkPhotoAbort} from './photo-task';
/** Aperçu PNG sans recherche de qualité ni lecture EXIF, réservé à la vérification locale. */
export async function photoPreview(blob:Blob,previous:PreparedPhoto,signal?:AbortSignal):Promise<PreparedPhoto>{
 const base64=await photoTask(new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Lecture de la photo impossible.'));reader.readAsDataURL(blob);
 }),5000,'Lecture de la photo trop longue.',signal);
 return {...previous,base64};
}
export async function compressVerifiedPhoto(blob:Blob,previous:PreparedPhoto,signal?:AbortSignal):Promise<PreparedPhoto>{
 checkPhotoAbort(signal);
 if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return {...await preparePhoto(blob,previous.position,[],signal),caption:previous.caption};
 const worker=new Worker(new URL('./photo-compression.worker.ts',import.meta.url),{type:'module'});
 try{
  const result=await photoTask(new Promise<Blob>((resolve,reject)=>{
   worker.onmessage=(event:MessageEvent<{blob?:Blob;error?:string}>)=>event.data.blob?resolve(event.data.blob):reject(Error(event.data.error||'Compression impossible.'));
   worker.onerror=()=>reject(Error('Compression indisponible. Réessayez.'));
   worker.postMessage({blob});
  }),60000,'Compression trop longue. Réessayez.',signal);
  if(result.type!=='image/webp'||result.size>PHOTO_TARGET_BYTES)throw Error('La photo préparée dépasse la limite autorisée.');
  return photoPreview(result,previous,signal);
 }finally{worker.terminate();}
}
