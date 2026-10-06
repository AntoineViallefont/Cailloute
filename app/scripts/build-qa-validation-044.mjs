import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
await build({configFile:false,root:process.cwd(),plugins:[react()],publicDir:false,base:'/qa044/',define:{'process.env.NODE_ENV':'"production"','import.meta.env.DEV':'true','import.meta.env.VITE_PERSONAL_MODE':'"true"','import.meta.env.VITE_FREE_COLLABORATION':'"true"','import.meta.env.VITE_FREE_EMULATORS':'"true"'},worker:{format:'es'},build:{outDir:'/tmp/qa044-bundle',emptyOutDir:true,lib:{entry:resolve('scripts/qa-validation-entry.mjs'),formats:['es'],fileName:()=> 'harness.js'},minify:true}});

writeFileSync('/tmp/qa044-bundle/index.html','<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/cailloute.css"></head><body><script type="module" src="/harness.js"></script></body></html>');
