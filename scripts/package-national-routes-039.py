"""Découpe les tracés par ligne et élimine les géométries strictement identiques.
Une consultation d’arrêt ne télécharge pas les tracés de tout le réseau.
"""
import json,hashlib
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'app/public/transit-france';DIR=ROOT/'donnees/france/gtfs';DIR.joinpath('routes').mkdir(exist_ok=True)
index_path=ROOT/'donnees/france/routes-index-039.json'
summary=json.loads(index_path.read_text()) if index_path.exists() else []
for path in sorted(OUT.glob('*.json')):
 data=json.loads(path.read_text());groups=defaultdict(list)
 for route in data['routes']:groups[route['line']].append(route)
 resource=path.stem;dest=OUT/resource;dest.mkdir(exist_ok=True)
 for line,rows in groups.items():
  by_mode={}
  for row in rows:
   key=row['mode'];out=by_mode.setdefault(key,{**row,'id':f'gtfs:{resource}:{line}:{key}','paths':[],'destinations':[]});seen={json.dumps(p,separators=(',',':')) for p in out['paths']}
   for p in row['paths']:
    signature=json.dumps(p,separators=(',',':'))
    if signature not in seen:seen.add(signature);out['paths'].append(p)
   out['destinations']=sorted(set(out['destinations']+row['destinations']))[:30]
  name=hashlib.sha256(line.encode()).hexdigest()[:16]+'.json';(dest/name).write_text(json.dumps({'routes':list(by_mode.values())},ensure_ascii=False,separators=(',',':')))
 summary=[r for r in summary if r['resourceId']!=resource]
 summary.append({'resourceId':resource,'lines':len(groups),'routes':len(data['routes'])})
 # Archives brutes de compilation conservées hors de l’application.
 path.replace(DIR/'routes'/path.name)
(ROOT/'donnees/france/routes-index-039.json').write_text(json.dumps(summary));print('Réseaux découpés',len(summary),'lignes',sum(r['lines'] for r in summary))
