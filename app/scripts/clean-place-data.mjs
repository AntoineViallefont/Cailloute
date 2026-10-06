import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanPlaceText, summarizePlaceText } from '../src/place-text.mjs';

const root = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const save = async (path, value) => writeFile(new URL(path, root), JSON.stringify(value) + '\n');
const rawFile = new URL('../../donnees/descriptions-culture-originales.json', import.meta.url);
const extraction = spawnSync('python3', [fileURLToPath(new URL('../../scripts/prepare-place-text-sources.py', import.meta.url)), fileURLToPath(rawFile)], {encoding:'utf8'});
if (extraction.status !== 0) throw Error(extraction.stderr || 'Lecture des sources culturelles impossible.');
console.log(extraction.stdout.trim());
const originals = JSON.parse(await readFile(rawFile, 'utf8'));
const patches = await read('app/src/data-open-enrichment.json');
const changes = [], report = {sourceDescriptionsRecovered:0, importedDescriptionsCleaned:0, descriptionsSummarized:0, baseDescriptionsCleaned:0, hoursStoredUnchanged:true, firebaseWrites:0};
for (const [id, row] of Object.entries(patches)) {
  const old = row.patch?.description;
  if (!old) continue;
  const source = originals[id] || old;
  const cleaned = cleanPlaceText(source), summary = summarizePlaceText(source);
  if (originals[id]) report.sourceDescriptionsRecovered++;
  if (cleaned.length > 360) report.descriptionsSummarized++;
  if (old !== summary) {
    changes.push({id, original:old, sourceText:cleaned, summary});
    row.patch.description = summary; report.importedDescriptionsCleaned++;
  }
}
await save('app/src/data-open-enrichment.json', patches);
// Les sources brutes restent intactes ; seuls les catalogues d'application sont préparés.
const files = ['seed.json','catalog-017.json','catalog-health-015.json','catalog-toilets-017.json','catalog-family-017.json', ...(await readdir(new URL('app/public/france/',root))).filter(f=>f.endsWith('.json')&&f!=='index.json').map(f=>'france/'+f)];
const positions = new Map();
for (const file of files) {
  const places = await read('app/public/'+file); let changed = false;
  for (const place of places) {
    positions.set(place.id, place);
    if(place.community || place.id.startsWith("c_") || !!place.verified_by || place.personal_edited)continue;
    const text = summarizePlaceText(place.description);
    if (text !== place.description) {
      changes.push({id:place.id, original:place.description, sourceText:cleanPlaceText(place.description), summary:text, file});
      place.description = text; changed = true; report.baseDescriptionsCleaned++;
    }
  }
  if (changed) await save('app/public/'+file,places);
}
const regional = new Map();
for (const [id, patch] of Object.entries(patches)) {
  const place = positions.get(id); if (!place) continue;
  const key = `${Math.floor(place.lat)}_${Math.floor(place.lon)}`;
  if (!regional.has(key)) regional.set(key, {});
  regional.get(key)[id] = patch;
}
for (const [key, rows] of regional) await save(`app/public/enrichment/${key}.json`,rows);
const version = createHash('sha256').update(JSON.stringify(patches)+'\n').digest('hex').slice(0,16);
await save('app/public/enrichment/index.json',{schema:1,version,tiles:[...regional.keys()].sort()});
await mkdir(new URL('donnees/nettoyage-lieux/',root),{recursive:true});
let previous=[];try{previous=await read('donnees/nettoyage-lieux/descriptions.json');}catch(e){if(e.code!=='ENOENT')throw e;}
const history=new Map(previous.map(row=>[row.id+':'+(row.file||''),row]));
for(const row of changes){const key=row.id+':'+(row.file||'');history.set(key,{...row,original:history.get(key)?.original??row.original});}
await save('donnees/nettoyage-lieux/descriptions.json',[...history.values()]);
await writeFile(new URL('donnees/nettoyage-lieux/rapport.json',root),JSON.stringify({...report, importedDescriptionsCleaned:[...history.values()].filter(row=>!row.file).length,baseDescriptionsCleaned:[...history.values()].filter(row=>row.file).length,descriptionsSummarized:[...history.values()].filter(row=>row.sourceText.length>360).length,descriptionMaximumCharacters:360,currentRun:report,version,examples:[...history.values()].slice(0,8)},null,2)+'\n');
console.log(JSON.stringify(report));
