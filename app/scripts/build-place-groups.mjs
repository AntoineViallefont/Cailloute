import { readFile, writeFile, readdir,mkdir,rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {applyVerifiedMerges} from './verified-place-merges.mjs';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { groupPlaces } = await server.ssrLoadModule('/src/group-places.ts');
  const files = ['seed.json', 'catalog-017.json', 'catalog-health-015.json', 'catalog-toilets-017.json', 'catalog-family-017.json', ...(await readdir('public/france')).filter(f => f.endsWith('.json') && f !== 'index.json').sort().map(f => `france/${f}`)];
  const rows = new Map();
  for (const file of files) for (const p of JSON.parse(await readFile(`public/${file}`, 'utf8'))) if (!rows.has(p.id)) rows.set(p.id,p);
  let previous = { members: {} };
  try { previous = JSON.parse(await readFile('scripts/catalog-group-registry.json', 'utf8')); } catch(e) { if (e.code !== 'ENOENT') throw e; }
  let members = {...previous.members};
  // Une nouvelle édition ajoute des IDs, sans changer les rattachements déjà publiés.
  for (const group of groupPlaces([...rows.values()])) {
    const sources = group.merged_members || [group];
    const existing = [...new Set(sources.map(p => members[p.id]?.id).filter(Boolean))];
    const newSources = sources.filter(p => !members[p.id]);
    if (existing.length > 1) {
      for (const p of newSources) members[p.id] = {id:p.id}; // Ambigu : ne pas fusionner deux groupes établis.
    } else {
      const id = existing[0] || sources.map(p=>p.id).sort()[0];
      for (const p of newSources) members[p.id] = {id, ...(group.group_kind ? {kind:group.group_kind} : {})};
    }
  }
  if (process.argv.includes('--merge-initial')) {
    const { mergeInitialGroups } = await server.ssrLoadModule('/src/catalog-migration.ts');
    members = mergeInitialGroups([...rows.values()], members);
  }
  const verified=JSON.parse(await readFile('scripts/verified-place-merges.json','utf8'));
  const audited=applyVerifiedMerges([...rows.values()],members,verified);members=audited.members;
  const ordered = Object.fromEntries(Object.entries(members).sort(([a],[b])=>a.localeCompare(b)));
  const version = createHash('sha256').update(JSON.stringify(ordered)).digest('hex').slice(0,16);
  await writeFile('scripts/catalog-group-registry.json', JSON.stringify({version,members:ordered}));
  const counts = new Map();
  for (const g of Object.values(ordered)) counts.set(g.id,(counts.get(g.id)||0)+1);
  const shared = Object.fromEntries(Object.entries(ordered).filter(([,g])=>counts.get(g.id)>1));
  await writeFile('public/place-groups.json', JSON.stringify({version,members:shared}));
  await writeFile('src/catalog-version.ts', `// Généré par npm run catalog:groups.\nexport const catalogGroupsVersion = ${JSON.stringify(version)};\n`);
  const { mergePlaceData } = await server.ssrLoadModule('/src/group-places.ts');
  const { normalizePlace } = await server.ssrLoadModule('/src/place-rules.ts');
  const { enrichImported } = await server.ssrLoadModule('/src/place-enrichment.ts');
  const grouped = new Map();
  for (const [source, g] of Object.entries(shared)) {
    const p = rows.get(source); if (!p) continue;
    if (!grouped.has(g.id)) grouped.set(g.id, []);
    grouped.get(g.id).push(normalizePlace(enrichImported(p)));
  }
  const prepared = [...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([id, originals])=>{
    originals.sort((a,b)=>Number(b.id===id)-Number(a.id===id)||a.id.localeCompare(b.id));
    const {merged_members, catalog_group, ...place} = mergePlaceData(originals);
    const correction=audited.corrections.get(id);
    if(correction?.hours){place.hours_variants=[correction.hours];place.merged_conflicts=place.merged_conflicts.filter(key=>key!=='hours');}
    return {id, place:{...place,...correction,id,catalog_sources:originals.map(p=>p.id),group_kind:shared[originals[0].id]?.kind}, originals};
  });
  // Calcul progressif : le catalogue national dépasse la taille maximale d’une chaîne JS.
  const canonicalHash = createHash('sha256').update('{"format":"gzip","groups":[');
  for (const [index, group] of prepared.entries()) {
    if (index) canonicalHash.update(',');
    canonicalHash.update(JSON.stringify(group));
  }
  const canonicalVersion = canonicalHash.update(']}').digest('hex').slice(0,16);
  for(const row of prepared)row.place.catalog_version=canonicalVersion;
  await rm('public/canonical',{recursive:true,force:true});await mkdir('public/canonical',{recursive:true});
  const chunks=new Map();
  for(const group of prepared){const key=`${Math.floor(group.place.lat*4)}_${Math.floor(group.place.lon*4)}`;if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(group);}
  const tiles=[];
  for(const [key,groups]of chunks){
    const originals=groups.flatMap(g=>g.originals),file=`${key}.json.gz`;
    const bounds=[Math.min(...originals.map(p=>p.lon)),Math.min(...originals.map(p=>p.lat)),Math.max(...originals.map(p=>p.lon)),Math.max(...originals.map(p=>p.lat))];
    await writeFile(`public/canonical/${file}`,gzipSync(JSON.stringify({version:canonicalVersion,groups}),{level:9}));tiles.push({file,bounds,count:groups.length});
  }
  await writeFile('public/canonical-places.json', JSON.stringify({version:canonicalVersion,tiles}));
  await writeFile('src/canonical-version.ts', `// Fiches fusionnées du catalogue initial ; nouveaux lots nationaux dédupliqués à l’import.\nexport const canonicalCatalogVersion = ${JSON.stringify(canonicalVersion)};\n`);
  console.log(`${rows.size} lieux sources ; ${new Set(Object.values(members).map(g=>g.id)).size} groupes permanents ; version ${version}`);
} finally { await server.close(); }
