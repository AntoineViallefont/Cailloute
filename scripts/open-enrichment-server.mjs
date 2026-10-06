import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {readFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {createServer}=await import(require.resolve('vite'));
export async function enrichmentServer(directory=resolve(root,'donnees/enrichissement-ouvert'),port=5191,emulators=false) {
  const folder=resolve(directory);
  const handler=async(req,res,next)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(!url.pathname.startsWith('/__open/'))return next();
    if(req.method!=='GET'){res.statusCode=405;return res.end();}
    const relative=decodeURIComponent(url.pathname.slice('/__open/'.length));
    if(!/^(candidates\.json|report\.json|photos\/[a-f0-9]+\.webp|originals\/[a-f0-9]+\.image)$/.test(relative)){res.statusCode=404;return res.end();}
    const path=resolve(folder,relative);
    if(!path.startsWith(folder+sep)){res.statusCode=404;return res.end();}
    try{const data=await readFile(path);res.setHeader('Content-Type',relative.endsWith('.json')?'application/json; charset=utf-8':relative.endsWith('.webp')?'image/webp':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.statusCode=404;res.end();}
  };
  const server=await createServer({root:resolve(root,'app'),cacheDir:resolve(root,`app/node_modules/.vite-open-${port}`),server:{host:'127.0.0.1',port,strictPort:true,hmr:false},define:{'import.meta.env.VITE_FREE_COLLABORATION':JSON.stringify(emulators?'true':'false'),'import.meta.env.VITE_FREE_EMULATORS':JSON.stringify('true'),'import.meta.env.VITE_PERSONAL_MODE':JSON.stringify('true')},plugins:[{name:'local-enrichment-files',configureServer(server){server.middlewares.use(handler);}}]});
  await server.listen();
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=await enrichmentServer();
  console.log('Prévisualisation locale : http://127.0.0.1:5191/exemple-enrichissement.html');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void server.close().then(()=>process.exit()));
}
