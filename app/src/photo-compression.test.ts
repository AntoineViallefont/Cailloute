import {it,expect,vi,afterEach} from 'vitest';
import {compressVerifiedPhoto} from './photo-compression';
afterEach(()=>vi.unstubAllGlobals());
function worker(){
 const state:{instance?:any,terminated:number}={terminated:0};
 vi.stubGlobal('OffscreenCanvas',class{});
 vi.stubGlobal('Worker',class{onmessage:any;onerror:any;constructor(){state.instance=this;}postMessage(){}terminate(){state.terminated++;}});
 return state;
}
it('arrête réellement le worker lors d’une annulation et ignore la réponse tardive',async()=>{
 const state=worker(),controller=new AbortController();const task=compressVerifiedPhoto(new Blob(['masqué']),{base64:'preview',caption:''},controller.signal);
 controller.abort();await expect(task).rejects.toMatchObject({name:'AbortError'});expect(state.terminated).toBe(1);
 state.instance.onmessage({data:{blob:new Blob(['late'],{type:'image/webp'})}});expect(state.terminated).toBe(1);
});
it('refuse une copie dépassant 40 Ko, sans renvoyer l’aperçu non compressé',async()=>{
 const state=worker();const task=compressVerifiedPhoto(new Blob(['masqué']),{base64:'preview',caption:''});
 state.instance.onmessage({data:{blob:new Blob([new Uint8Array(40001)],{type:'image/webp'})}});
 await expect(task).rejects.toThrow('limite');expect(state.terminated).toBe(1);
});
it('une erreur du worker garde la photo indisponible pour publication',async()=>{
 const state=worker();const task=compressVerifiedPhoto(new Blob(['masqué']),{base64:'preview',caption:''});state.instance.onmessage({data:{error:'Compression impossible.'}});
 await expect(task).rejects.toThrow('Compression impossible');expect(state.terminated).toBe(1);
});
