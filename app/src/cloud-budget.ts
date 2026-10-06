/** Budget commun, conservé sur l’appareil. Les actions explicites ne sont pas bloquées. */
export const DAILY_AUTOMATIC_READS = 50;
export type ReadMode = 'automatic' | 'manual' | 'admin';
export const BUDGET_KEY = 'firebase-read-budget-v1';
type Budget = {day:number; automatic:number; manual:number; admin?:number};
const today = () => Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()).replaceAll('-',''));
export class AutomaticReadLimit extends Error {
 readonly code = 'free/local-read-budget';
 constructor(){super('Actualisation automatique reportée à demain. Les données enregistrées restent disponibles.');}
}
async function change<T>(fn:(value:Budget)=>T):Promise<T>{
 const {db}=await import('./store');
 return db.transaction('rw',db.meta,async()=>{
  const old=(await db.meta.get(BUDGET_KEY))?.value as Budget|undefined;
  const value:Budget=old?.day===today()?{...old}:{day:today(),automatic:0,manual:0};
  const before=JSON.stringify(old);
  const result=fn(value);if(before!==JSON.stringify(value))await db.meta.put({key:BUDGET_KEY,value});return result;
 });
}
export async function automaticReadsLeft(mode:ReadMode='automatic'):Promise<number>{
 if(mode==='admin')return Infinity;
 return change(value=>Math.max(0,DAILY_AUTOMATIC_READS-value.automatic-value.manual));
}
// Réservation avant le réseau : une réponse perdue reste comptabilisée.
export async function reserveReads(count:number,mode:ReadMode='automatic'){
 const amount=Math.max(0,Math.ceil(count));
 const day=today();
 await change(value=>{
  if(mode==='automatic' && value.automatic+value.manual+amount>DAILY_AUTOMATIC_READS)throw new AutomaticReadLimit();
  value[mode]=(value[mode]||0)+amount;
 });
 return async(actual:number)=>{
  const refund=Math.max(0,amount-Math.ceil(actual));
  if(refund && today()===day)await change(value=>{value[mode]=Math.max(0,(value[mode]||0)-refund);});
 };
}
export async function countManualReads(count:number){await reserveReads(count,'manual');}
export function isAutomaticReadLimit(error:unknown){return (error as {code?:string})?.code==='free/local-read-budget';}
