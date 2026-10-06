"""Assemble et contrôle les lots nationaux ; ne touche pas aux contributions."""
import json,math,unicodedata
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'app/public/france';DIR=ROOT/'donnees/france'
def norm(s):return ' '.join(unicodedata.normalize('NFKD',s).casefold().split())
def identity(p):return norm(p['name']),round(p['lat'],6),round(p['lon'],6)
index=json.loads((OUT/'index.json').read_text());seen=set()
for t in index['tiles']:
 for p in json.loads((OUT/t['file']).read_text()):
  if p['category']=='transit':seen.add(identity(p))
rows=[];row_ids=set()
for t in json.loads((DIR/'fallback-index-039.json').read_text()):
 for p in json.loads((OUT/t['file']).read_text()):
  k=identity(p)
  if k not in seen and p['id'] not in row_ids:rows.append(p);seen.add(k);row_ids.add(p['id'])
tiles=defaultdict(list)
for p in rows:tiles[f"fallback_transit_{math.floor(p['lat']*4)}_{math.floor(p['lon']*4)}"].append(p)
fallback=[]
for key,places in sorted(tiles.items()):
 y,x=map(int,key.split('_')[2:])
 for n in range(0,len(places),2000):
  part=places[n:n+2000];file=f'{key}_{n//2000}.json';(OUT/file).write_text(json.dumps(part,ensure_ascii=False,separators=(',',':')));fallback.append({'file':file,'bounds':[x/4,y/4,(x+1)/4,(y+1)/4],'count':len(part)})
(DIR/'fallback-index-039.json').write_text(json.dumps(fallback))
report=json.loads((DIR/'fallback-report-039.json').read_text());report['total_after_deduplication']=len(rows);(DIR/'fallback-report-039.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
prefix=('family039_','shops039_','fallback_transit_');index['tiles']=[t for t in index['tiles'] if not t['file'].startswith(prefix)]
for name in ('family-index-039.json','shops-index-039.json','fallback-index-039.json'):index['tiles']+=json.loads((DIR/name).read_text())
index['total']=sum(t['count'] for t in index['tiles']);index['version']='2026-10-02-039';files={t['file'] for t in index['tiles']}
for p in OUT.glob('*.json'):
 if p.name.startswith(('transit_',*prefix)) and p.name not in files:p.unlink()
ids=set();counts=defaultdict(int)
for t in index['tiles']:
 data=json.loads((OUT/t['file']).read_text());assert len(data)==t['count'],t['file']
 for p in data:
  assert p['id'] not in ids,('duplicate',p['id']);ids.add(p['id']);counts[p['category']]+=1
  assert -6<=p['lon']<=10 and 41<=p['lat']<=52,p['id']
  if p['category']=='transit':assert set(p.get('transit_modes',[]))<=set(['bus','train','ferry','metro','tram','cable'])
(OUT/'index.json').write_text(json.dumps(index,separators=(',',':')))
result={'total':index['total'],'tiles':len(files),'categories':dict(counts),'fallback_without_current_lines':len(rows)};(DIR/'audit-national-039.json').write_text(json.dumps(result,indent=2));print(result)
