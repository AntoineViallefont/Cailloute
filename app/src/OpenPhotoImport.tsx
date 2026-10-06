import {useState} from 'react';
import {Modal} from './Modal';
import {PhotoCredit} from './PhotoCredit';
import {importOpenPhotos,readOpenPhotoPlan,type OpenPhotoPlan,type OpenPhotoItem} from './open-photo-import';
import {getFreeSession} from './free-cloud';
import {runFreeSync} from './free-sync';
import {db,enqueue} from './store';
const service={account:getFreeSession,sync:runFreeSync,async enqueueOnce(key:string,item:OpenPhotoItem){
 const bitmap=await createImageBitmap(await(await fetch(item.photo.url)).blob());
 try{if(!bitmap.width||!bitmap.height||Math.max(bitmap.width,bitmap.height)>960)throw new Error('Photo illisible ou non préparée pour le catalogue.');}finally{bitmap.close();}
 return db.transaction('rw',['personal','places','meta','removed','freeQueue'],async()=>{
  if(await db.meta.get(key))return false;
  const place=await db.places.get(item.place.id);
  if(!place || place.deleted || place.redirect || place.withdrawn || await db.removed.get(place.id))throw new Error('Lieu absent ou supprimé. Import interrompu.');
  const operationId=await enqueue('photo.add',place.id,{base64:item.photo.url.split(',')[1],caption:item.photo.caption,privacy_reviewed:true,rights_accepted:true});
  // Même transaction que la file d'envoi : une reprise ne crée pas de doublon.
  await db.meta.put({key,value:{operationId,created:new Date().toISOString()}});
  return true;
 });
}};
export function OpenPhotoImport({onClose}:{onClose:()=>void}){
 const [plan,setPlan]=useState<OpenPhotoPlan>(),[agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <Modal title="Importer des photos libres" onClose={()=>{if(!busy)onClose();}}><div className="form">
  <label>Lot validé<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{setAgreed(false);setPlan(undefined);setMessage('');const file=e.target.files?.[0];if(!file)return;if(file.size>5_000_000){setMessage('Lot trop volumineux.');return;}void file.text().then(text=>setPlan(readOpenPhotoPlan(JSON.parse(text)))).catch(error=>setMessage(error.message));}}/></label>
  {plan&&<><p>{plan.candidates.length} photo(s) WebP, 40 Ko maximum.</p><p>Les photos suivent les mêmes règles de signalement, modification et suppression que les contributions.</p>
   {plan.candidates.map(item=><figure key={item.place.id}><img src={item.photo.url} alt="Photo à importer" style={{width:'100%',maxHeight:200,objectFit:'contain'}}/><PhotoCredit caption={item.photo.caption}/></figure>)}
   <label className="consent-row"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} disabled={busy}/>Je confirme les lieux, les crédits et le floutage de ce lot.</label>
   <button className="primary" disabled={!agreed||busy||!plan.candidates.length} onClick={()=>{setBusy(true);setMessage('');void importOpenPhotos(plan,service,(n,total)=>setMessage(`Préparation ${n} / ${total}…`)).then(result=>{setMessage(`${result.queued} photo(s) préparée(s), ${result.skipped} déjà importée(s). Consultez les contributions en attente pour vérifier l’envoi.`);setAgreed(false);}).catch(error=>setMessage(error.message)).finally(()=>setBusy(false));}}>Importer le lot</button>
  </>}
  {message&&<p role="status">{message}</p>}
 </div></Modal>;
}
