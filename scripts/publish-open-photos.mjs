/** Import automatique après validation, atomique et reprenable, sans API payante. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {webpDimensions} from './webp-check.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fields=['name','category','lat','lon','address','city','hours','description','website','activity_type','health_type','pediatric','baby_food','organic','toilet_public','children_clothes','shop_type','information_validated','validated_at','validation_changed_at','age','access','transit_modes','transit_lines','toilets_available','wheelchair','changing_table','drinking_water','free','fenced','elevator','shade','shelter','bench','condition','condition_observed_at'];
const limits={name:160,address:300,city:100,hours:500,description:2000,age:100,access:300,website:300,activity_type:100,shop_type:100,validated_at:40,validation_changed_at:40,condition:100,condition_observed_at:40};
export function compactPlace(raw){
 const p={id:raw.id,version:1,name:'',category:'other',lat:0,lon:0,address:'',city:'',hours:'',description:'',age:'',access:'',wheelchair:null,changing_table:null,drinking_water:null,free:null,fenced:null,elevator:null,sources:[],rating:null,review_count:0,community:true,photo_count:0};
 for(const key of fields)if(raw[key]!==undefined)p[key]=raw[key];
 for(const [key,limit] of Object.entries(limits))if(key in p)p[key]=String(p[key]??'').slice(0,limit);
 p.transit_lines=Array.isArray(raw.transit_lines)?raw.transit_lines.slice(0,80).map(v=>String(v).slice(0,20)):[];
 if(!p.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))throw Error('Lieu incomplet.');
 return p;
}
export function encode(value){
 if(value===null)return {nullValue:null};
 if(value instanceof Date)return {timestampValue:value.toISOString()};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 if(typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]))}};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number'&&Number.isFinite(value))return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 throw Error('Type de champ invalide.');
}
export function decode(value){
 if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,decode(v)]));
 if('arrayValue'in value)return (value.arrayValue.values||[]).map(decode);
 if('timestampValue'in value)return new Date(value.timestampValue);
 if('integerValue'in value)return Number(value.integerValue);
 if('nullValue'in value)return null;
 return value.stringValue??value.booleanValue??value.doubleValue;
}
export function preparePublication(row,documents,names){
 const [budgetDoc,sharedDoc,photoDoc,ledgerDoc]=documents;
 if(ledgerDoc||photoDoc)return {skip:'already-imported'};
 const old=sharedDoc?decode({mapValue:{fields:sharedDoc.fields}}):null;
 if(old?.deleted||old?.place?.deleted||old?.place?.withdrawn||old?.place?.redirect)return {skip:'deleted-place'};
 const budget=budgetDoc&&decode({mapValue:{fields:budgetDoc.fields}});
 if(!budget||!Number.isInteger(budget.places)||!Number.isInteger(budget.previews)||budget.places>=3000&&!old||budget.previews>=10000)return {skip:'storage-limit'};
 const version=(old?.version||0)+1;
 // Une photo importée ne modifie aucun champ existant, avis ou décision de modération.
 const place={...(old?.place||compactPlace({...row.place,...row.patch})),version,photo_count:(old?.place?.photo_count||0)+1};
 const image=Buffer.from(row.photo.url.split(',')[1],'base64');
 const shared={...old,place,reviews:old?.reviews||{},deleted:false,version,cell:old?.cell||`${Math.floor(place.lat*4)}:${Math.floor(place.lon*4)}`,lastOp:names.operation,by:'open-catalog',kind:'photo.add',lastPhoto:names.photoId};
 const photo={placeId:place.id,user_id:'open-catalog',author:'Catalogue libre',url:row.photo.url,caption:row.photo.caption,privacy_reviewed:true,rights_accepted:true,lastOp:names.operation};
 const ledger={placeId:place.id,photoId:names.photoId,sourceUrl:row.photo.sourceUrl,sha256:createHash('sha256').update(image).digest('hex')};
 const nextBudget={...budget,places:budget.places+(old?0:1),previews:budget.previews+1,lastType:'shared',lastId:place.id};
 const payloads=[nextBudget,shared,photo,ledger];
 const writes=payloads.map((data,index)=>({update:{name:names.documents[index],fields:encode(data).mapValue.fields},currentDocument:documents[index]?{updateTime:documents[index].updateTime}:{exists:false},...(index>0?{updateTransforms:[{fieldPath:index===1?'updated':'created',setToServerValue:'REQUEST_TIME'}]}:{})}));
 return {writes};
}
export function validatePlan(plan){
 if(plan?.schema!==1||plan.approved!==true||!Number.isFinite(Date.parse(plan.approvedAt))||!Array.isArray(plan.candidates))throw Error('Validation du lot absente.');
 const seen=new Set();
 return plan.candidates.filter(row=>row.photo).map(row=>{
  const p=row.photo,match=/^@commons:([1-9]\d*)\|(CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)|CC0|Public domain)\|([^|\r\n]+)$/.exec(p.caption||'');
  if(!match||p.caption.length>160||match[2]!==p.license||match[3]!==p.author||p.privacyReviewed!==true||!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(p.sourceUrl)||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(p.url)||!/^[-A-Za-z0-9:_]{1,128}$/.test(row.place?.id||''))throw Error('Photo ou crédit invalide.');
  const bytes=Buffer.from(p.url.split(',')[1],'base64');
  if(bytes.length<20||bytes.length>40000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)!==bytes.length-8)throw Error('Photo non conforme.');
  webpDimensions(bytes);
  const key=`${row.place.id}:${match[1]}`;if(seen.has(key))throw Error('Photo en double.');seen.add(key);
  return {...row,commonsId:match[1]};
 });
}
export async function publishPlan(plan,{publish=false,emulator=false,reportPath=resolve(root,'livraison/IMPORT-PHOTOS-OUVERTES.json')}={}){
 const rows=validatePlan(plan);
 if(!publish)return {mode:'simulation locale',photos:rows.length,nominalReads:rows.length*4,maximumReads:rows.length*16,maximumWrites:rows.length*4,firebaseCalls:0};
 // Le premier lot est limité pour laisser de la capacité aux contributions.
 if(rows.length>2000)throw Error('Plus de 2 000 photos : import à répartir avant publication pour conserver la réserve gratuite.');
 const project=emulator?'demo-cailloute-free':'cailloute-macavi';
 let token=emulator?'owner':'';
 if(!emulator){
  execFileSync('sh',[resolve(root,'scripts/check-free-tier.sh'),project],{stdio:['ignore','ignore','pipe']});
  const require=createRequire(import.meta.url);const auth=require('/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js');
  const account=auth.getProjectDefaultAccount(root)||auth.getGlobalDefaultAccount();
  if(!account)throw Error('Connexion Firebase locale absente.');
  token=(await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase'])).access_token;
 }
 const base=`${emulator?'http://127.0.0.1:8089':'https://firestore.googleapis.com'}/v1/projects/${project}/databases/(default)/documents`;
 const name=`projects/${project}/databases/(default)/documents`;
 async function api(suffix,body){const response=await fetch(base+suffix,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});if(!response.ok)throw Object.assign(Error(`Import refusé (${response.status}).`),{status:response.status});return response.text();}
 const result={project,published:0,skipped:{},failed:0,date:new Date().toISOString()};
 for(const row of rows){
  const operation=`open_${row.commonsId}`,photoId=`${row.place.id}_${operation}`;
  const names={operation,photoId,documents:[`${name}/system/budget`,`${name}/shared/${row.place.id}`,`${name}/previews/${photoId}`,`${name}/openImports/${createHash('sha256').update(`${row.place.id}:${row.commonsId}`).digest('hex')}`]};
  for(let attempt=0;attempt<4;attempt++){
   const raw=await api(':batchGet',{documents:names.documents});
   const responses=JSON.parse(raw);
   const found=new Map(responses.filter(r=>r.found).map(r=>[r.found.name,r.found]));
   const next=preparePublication(row,names.documents.map(n=>found.get(n)),names);
   if(next.skip){result.skipped[next.skip]=(result.skipped[next.skip]||0)+1;break;}
   try{await api(':commit',{writes:next.writes});result.published++;break;}
   catch(error){if(![409,412,400].includes(error.status)||attempt===3)throw error;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
  }
  if(result.published%25===0)await writeFile(reportPath,JSON.stringify(result,null,2)+'\n');
 }
 await writeFile(reportPath,JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv.find(v=>v.endsWith('.json'));
 if(!file)throw Error('Indiquez le lot validé JSON.');
 const result=await publishPlan(JSON.parse(await readFile(file,'utf8')),{publish:process.argv.includes('--publish'),emulator:process.argv.includes('--emulator')});console.log(JSON.stringify(result));
}
