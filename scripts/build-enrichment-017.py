from pathlib import Path
import json,math,unicodedata,hashlib
root=Path(__file__).resolve().parents[1]
seed=json.loads((root/'app/public/seed.json').read_text())
raw=json.loads((root/'donnees/sources/osm_lyon_30km.json').read_text())['elements']
osm={f"osm:{e['type']}/{e['id']}":e.get('tags',{}) for e in raw}
def dist(a,b):return math.hypot((a['lat']-b['lat'])*111200,(a['lon']-b['lon'])*77600)
def norm(s):
 key=''.join(c for c in unicodedata.normalize('NFD',s.lower()) if c.isalnum() and not unicodedata.combining(c))
 return 'hoteldeville' if key.startswith('hoteldeville') else key
enriched={}; report={'organic':0,'public_toilets':0,'metro_lines':0,'new_toilets':0,'matched_toilets':0,'missing_metro_lines':[]}
refs=[p for p in seed if 'metro' in p.get('transit_modes',[]) and set(p.get('transit_lines',[]))&set('ABCD') and any(s['name']=='arrets_tcl' for s in p['sources'])]
for p in seed:
 patch={}
 tags=[osm[s['key']] for s in p['sources'] if s['key'] in osm]
 if p['category']=='food_shop':
  organic={t['organic'] for t in tags if t.get('organic') in ['yes','only','no']}
  if organic and not ('no' in organic and len(organic)>1):patch['organic']='no' not in organic;report['organic']+=1
 if p['category']=='toilet':
  access=p.get('access')
  if access in ['public','yes']:patch['toilet_public']=True
  elif access in ['customers','private','no','permit','key','university']:patch['toilet_public']=False
  if patch.get('toilet_public'):report['public_toilets']+=1
 if 'metro' in p.get('transit_modes',[]) and not p.get('transit_lines'):
  nearby=[r for r in refs if dist(p,r)<=250]
  named=[r for r in nearby if norm(r['name']) in norm(p['name']) or norm(p['name']) in norm(r['name'])]
  candidates=named or nearby
  line_sets={tuple(sorted(set(r['transit_lines'])&set('ABCD'))) for r in candidates}
  if candidates and (named or len(line_sets)==1 or len({norm(r['name']) for r in candidates})==1):
   patch['transit_lines']=sorted(set(line for r in candidates for line in r['transit_lines'] if line in 'ABCD'))
   patch['sources']=[s for r in candidates for s in r['sources'] if s['name']=='arrets_tcl'];report['metro_lines']+=1
  else:report['missing_metro_lines'].append({'id':p['id'],'name':p['name'],'nearby':len(nearby)})
 if patch:enriched[p['id']]=patch
additions=[]
for slug in ['bron','pierre-benite']:
 metadata=json.loads((root/f'donnees/metadonnees/toilettes-publiques-de-la-commune-de-{slug}.json').read_text());assert metadata['license']=='lov2'
 url=next(r['url'] for r in metadata['resources'] if r['format']=='geojson')
 data=json.loads((root/f'donnees/sources/toilettes-{slug}.geojson').read_text())
 for f in data['features']:
  p=f['properties'];lon,lat=f['geometry']['coordinates'][:2];uid=p['uid']
  source={'key':f'toilettes_{slug}:{uid}','name':f'Toilettes publiques · commune de {p["commune"]}','url':url,'license':'Licence Ouverte 2.0','retrieved_at':'2026-09-16'}
  candidates=sorted([x for x in seed+additions if x['category']=='toilet' and (any(uid in s['key'] for s in x['sources']) or dist(x,dict(lat=lat,lon=lon))<25)],key=lambda x:dist(x,dict(lat=lat,lon=lon)))
  if candidates:
   for x in candidates:
    patch=enriched.setdefault(x['id'],{});patch['toilet_public']=True;patch.setdefault('sources',[]).append(source)
   report['matched_toilets']+=1;continue
  item=dict(id='p_toilets017_'+hashlib.sha256(uid.encode()).hexdigest()[:16],version=1,name=p['nom'],category='toilet',lat=lat,lon=lon,address=p.get('adresse',''),city=p['commune'],hours='',description=p.get('infoloc',''),age='',access='public',toilet_public=True,toilets_available=True,wheelchair={'oui':True,'non':False}.get(p.get('acceshan')),changing_table=None,drinking_water=None,free={'non':True,'oui':False}.get(p.get('payant')),fenced=None,elevator=None,rating=None,review_count=0,information_validated=False,sources=[source],license_verified=True)
  additions.append(item)
report['new_toilets']=len(additions)
(root/'app/src/data-enrichment-017.json').write_text(json.dumps(enriched,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'app/public/catalog-toilets-017.json').write_text(json.dumps(additions,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'donnees/rapport-enrichissement-017.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
