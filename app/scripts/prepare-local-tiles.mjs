import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../public/',import.meta.url);
const files=['seed.json','catalog-017.json','catalog-health-015.json','catalog-toilets-017.json','catalog-family-017.json'];
const places=new Map();
for(const file of files)for(const place of JSON.parse(await readFile(new URL(file,root),'utf8')))if(!places.has(place.id))places.set(place.id,place);
const zones=new Map();
for(const place of places.values()){
 const key=`${Math.floor(place.lat*4)}_${Math.floor(place.lon*4)}`;
 const rows=zones.get(key)||[];rows.push(place);zones.set(key,rows);
}
const indexPath=new URL('france/index.json',root),index=JSON.parse(await readFile(indexPath,'utf8'));
const previous=new Map(index.tiles.map(t=>[t.file,t]));
index.tiles=index.tiles.filter(t=>!t.file.startsWith('local050_'));
for(const [key,rows] of zones){
 const file=`local050_${key}.json`;
 const bytes=JSON.stringify(rows),path=new URL(`france/${file}`,root);
 let old;try{old=await readFile(path,'utf8');}catch{}
 if(old!==bytes)await writeFile(path,bytes);
 index.tiles.push({...previous.get(file),file,bounds:[Math.min(...rows.map(p=>p.lon)),Math.min(...rows.map(p=>p.lat)),Math.max(...rows.map(p=>p.lon)),Math.max(...rows.map(p=>p.lat))],count:rows.length});
}
const bytes=JSON.stringify(index);if(await readFile(indexPath,'utf8')!==bytes)await writeFile(indexPath,bytes);
console.log(`Catalogue initial : ${places.size} lieux répartis en ${zones.size} zones locales.`);
