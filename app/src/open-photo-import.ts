import {photoCredit} from './photo-credit';
import type {FreeSession} from './free-cloud';
export interface OpenPhotoItem {place:{id:string};photo:{url:string;caption:string;privacyReviewed:true;sourceUrl:string;license:string;author:string}}
export interface OpenPhotoPlan {schema:1;approved:true;approvedAt:string;candidates:OpenPhotoItem[]}
export function readOpenPhotoPlan(raw:unknown):OpenPhotoPlan {
 const plan=raw as OpenPhotoPlan;
 if(plan?.schema!==1 || plan.approved!==true || !Number.isFinite(Date.parse(plan.approvedAt)) || !Array.isArray(plan.candidates) || plan.candidates.length>2500)throw new Error('Lot non validé ou invalide.');
 const candidates=plan.candidates.filter(row=>row.photo);
 if(candidates.length>10)throw new Error('Dix photos maximum par lot.');
 const ids=new Set<string>();
 for(const row of candidates){
  const photo=row.photo,credit=photoCredit(photo.caption||'');
  if(!row.place?.id || row.place.id.length>128 || !credit || photo.privacyReviewed!==true || credit.author!==photo.author || credit.license!==photo.license || !photo.url?.startsWith('data:image/webp;base64,') || !/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(photo.sourceUrl))throw new Error('Photo, floutage ou crédit invalide.');
  let bytes:string;try{bytes=atob(photo.url.slice('data:image/webp;base64,'.length));}catch{throw new Error('Photo illisible.');}
  if(bytes.length>40000 || bytes.slice(0,4)!=='RIFF' || bytes.slice(8,12)!=='WEBP' || bytes.length<20)throw new Error('Photo non conforme : WebP, 40 Ko maximum.');
  const key=`${row.place.id}:${credit.url}`;if(ids.has(key))throw new Error('Photo en double dans le lot.');ids.add(key);
 }
 return {...plan,candidates};
}
export interface PhotoImportService {account:()=>FreeSession|null;enqueueOnce:(key:string,item:OpenPhotoItem)=>Promise<boolean>;sync:()=>Promise<unknown>}
export async function importOpenPhotos(raw:unknown,service:PhotoImportService,progress?:(done:number,total:number)=>void) {
 const plan=readOpenPhotoPlan(raw),account=service.account();
 if(!account?.isAdmin || !account.verified || !account.termsAccepted || account.blocked)throw new Error('Un compte administrateur vérifié est nécessaire.');
 let queued=0,skipped=0;
 for(const [index,item] of plan.candidates.entries()){
  if(service.account()?.uid!==account.uid || !service.account()?.isAdmin || service.account()?.blocked)throw new Error('Le compte a changé. Import interrompu.');
  const key=`open-photo-import:${item.place.id}:${photoCredit(item.photo.caption)!.url}`;
  if(await service.enqueueOnce(key,item))queued++;else skipped++;
  progress?.(index+1,plan.candidates.length);
 }
 await service.sync();
 return {queued,skipped};
}
