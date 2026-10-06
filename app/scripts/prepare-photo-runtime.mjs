import { copyFileSync, mkdirSync } from 'node:fs';
const base = new URL('../', import.meta.url);
const target = new URL('public/photo-privacy/ort/',base);
mkdirSync(target,{recursive:true});
for (const file of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']) {
  copyFileSync(new URL('node_modules/onnxruntime-web/dist/'+file,base),new URL(file,target));
}
