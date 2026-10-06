import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>{
 const rows=new Map<string,any>();let chain=Promise.resolve();
 const meta={get:async(k:string)=>structuredClone(rows.get(k)),put:async(row:any)=>{rows.set(row.key,structuredClone(row));}};
 const transaction=async(...args:any[])=>{const result=chain.then(()=>args.at(-1)());chain=result.catch(()=>{});return result;};
 return {rows,db:{meta,transaction}};
});
vi.mock('./store',()=>({db:f.db}));
import {automaticReadsLeft,reserveReads,countManualReads,BUDGET_KEY} from './cloud-budget';
beforeEach(()=>{f.rows.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T18:00:00Z'));});
afterEach(()=>vi.useRealTimers());
it('deux téléchargements concurrents ne dépassent pas le budget commun',async()=>{
 await reserveReads(46);const results=await Promise.allSettled([reserveReads(3),reserveReads(3)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await automaticReadsLeft()).toBe(1);
});
it('le réseau perdu garde sa réservation, une petite réponse rend la différence',async()=>{
 const finish=await reserveReads(22);expect(await automaticReadsLeft()).toBe(28);await finish(5);expect(await automaticReadsLeft()).toBe(45);
 await reserveReads(20);expect(await automaticReadsLeft()).toBe(25);
});
it('les actions explicites restent possibles et suspendent ensuite les lectures automatiques',async()=>{
 await reserveReads(50);await countManualReads(9);expect(await automaticReadsLeft()).toBe(0);
 await expect(reserveReads(1)).rejects.toMatchObject({code:'free/local-read-budget'});
 expect((await f.db.meta.get(BUDGET_KEY)).value.manual).toBe(9);
});
it('utilise le renouvellement de quota à minuit du Pacifique, pas minuit en France',async()=>{
 vi.setSystemTime(new Date('2026-10-03T06:59:00Z'));await reserveReads(50);
 vi.setSystemTime(new Date('2026-10-03T07:01:00Z'));expect(await automaticReadsLeft()).toBe(50);
});
it('une ancienne réponse ne rembourse pas le quota du lendemain',async()=>{
 const finish=await reserveReads(20);vi.setSystemTime(new Date('2026-10-03T18:00:00Z'));await reserveReads(10);await finish(1);expect(await automaticReadsLeft()).toBe(40);
});
it('exempte les lectures administrateur sans consommer le budget des autres comptes',async()=>{
 await reserveReads(50);
 const finish=await reserveReads(200,'admin');await finish(180);
 expect(await automaticReadsLeft('admin')).toBe(Infinity);
 expect(await automaticReadsLeft()).toBe(0);
 expect((await f.db.meta.get(BUDGET_KEY)).value.admin).toBe(180);
 await expect(reserveReads(1)).rejects.toMatchObject({code:'free/local-read-budget'});
});
