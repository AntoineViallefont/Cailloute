import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../public/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,24);
const indexPath=new URL('france/index.json',root);
const index=JSON.parse(await readFile(indexPath,'utf8'));
for(const tile of index.tiles){tile.hash=hash(await readFile(new URL(`france/${tile.file}`,root)));tile.baselineHash ??= tile.hash;}
// Les installations 041 peuvent adopter les empreintes sans réimporter leur catalogue inchangé.
index.hashBaselineVersion ??= index.version;
await writeFile(indexPath,JSON.stringify(index));
const routes={};
async function walk(directory,prefix=''){
 for(const item of await readdir(directory,{withFileTypes:true})){
  const path=`${prefix}${item.name}`;
  if(item.isDirectory())await walk(new URL(`${item.name}/`,directory),`${path}/`);
  else if(item.name.endsWith('.json'))routes[`/transit-france/${path}`]=hash(await readFile(new URL(item.name,directory)));
 }
}
await walk(new URL('transit-france/',root));
const routeBytes=JSON.stringify(routes);
await writeFile(new URL('route-assets.json',root),routeBytes);
await writeFile(new URL('../src/catalog-hashes.ts',import.meta.url),`// Généré à partir des catalogues.
export const catalogIndexHash='${hash(JSON.stringify(index))}';
export const routeManifestHash='${hash(routeBytes)}';
`);
console.log(`Empreintes : ${index.tiles.length} fichiers de lieux, ${Object.keys(routes).length} tracés.`);
