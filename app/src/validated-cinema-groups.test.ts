import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import rules from '../scripts/verified-place-merges.json';
it('fusionne exactement les 13 groupes autorisés et garde coordonnées, sources et informations utiles',()=>{
 const registry=JSON.parse(readFileSync(new URL('../public/place-groups.json',import.meta.url),'utf8')).members;
 const audit=JSON.parse(readFileSync(new URL('../../donnees/nettoyage-lieux/fusions-validees-13-groupes.json',import.meta.url),'utf8'));
 const cache=new Map<string,any>();
 expect(audit.numbers).toEqual([6,7,8,9,11,12,13,14,15,16,18,19,20]);
 for(const row of audit.groups){
  const roots=new Set(row.members.map((id:string)=>registry[id].id));expect(roots.size).toBe(1);const root=[...roots][0];
  const tile=`${Math.floor(row.lat*4)}_${Math.floor(row.lon*4)}.json.gz`;
  if(!cache.has(tile))cache.set(tile,JSON.parse(gunzipSync(readFileSync(new URL('../public/canonical/'+tile,import.meta.url))).toString()));
  const group=cache.get(tile).groups.find((g:any)=>g.id===root);expect(group).toBeTruthy();
  expect(group.place).toMatchObject({name:row.name,lat:row.lat,lon:row.lon,location_kind:row.locationKind});
  expect(group.place.address).toBeTruthy();
  const rule=rules.find((r:any)=>r.validationNumber===row.number)!;
  for(const id of row.members)expect(group.originals.some((p:any)=>p.id===id)).toBe(true);
  for(const key of rule.sourceKeys)expect(group.place.sources.some((s:any)=>s.key===key)).toBe(true);
  if([12,13,16].includes(row.number))expect(group.place.wheelchair).toBe(true);
  if([7,14,15,18].includes(row.number))expect(group.place.description).toBeTruthy();
 }
});
