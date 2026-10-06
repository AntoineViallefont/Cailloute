"""Complément des réseaux sans GTFS exploitable : seuls les arrêts du PAN national.
Le fichier de janvier ne permet pas de reconstituer des lignes ni des horaires actuels.
"""
import json,csv,sys,math,uuid
from pathlib import Path
from collections import defaultdict,Counter
import requests
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.france import in_france
DIR=ROOT/'donnees/france';OUT=ROOT/'app/public/france';report=json.loads((DIR/'gtfs/rapport.json').read_text());cat=json.loads((DIR/'gtfs/catalogue.json').read_text());success={r['datasetId'] for r in report['resources'] if r['status']=='ok' and r.get('stops',0)>0};candidates={d['datagouv_id']:d for d in cat if d.get('type')=='public-transit' and d['id'] not in success and any(r.get('format','').lower()=='gtfs' for r in d.get('resources',[]))};rows={};counts=Counter()
metadata=requests.get('https://www.data.gouv.fr/api/1/datasets/arrets-de-transport-en-france/',timeout=30).json();assert metadata['license']=='lov2';resource=next(r for r in metadata['resources'] if r['format']=='csv');source={'name':'Point d’accès national · arrêts de transport','url':'https://www.data.gouv.fr/datasets/arrets-de-transport-en-france','license':'Licence Ouverte 2.0','retrieved_at':resource['last_modified']};tiles=defaultdict(list)
with requests.get(resource['url'],stream=True,timeout=(20,90)) as response:
 response.raise_for_status();response.encoding='utf-8-sig'
 for row in csv.DictReader(response.iter_lines(decode_unicode=True)):
  dataset=row['dataset_datagouv_id'];d=candidates.get(dataset)
  if not d or row.get('location_type') not in ('','0','1'):continue
  try:lat,lon=float(row['stop_lat']),float(row['stop_lon'])
  except:continue
  if not in_france(lat,lon):continue
  name=row['stop_name'];identity=(dataset,name.strip().casefold(),round(lat,6),round(lon,6))
  if identity in rows:continue
  key='pan-stops:'+dataset+':'+row['stop_id'];p={'id':'p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex,'version':1,'name':name[:160],'category':'transit','lat':round(lat,7),'lon':round(lon,7),'address':'','city':'','hours':'','description':'','age':'','access':'unknown','transit_modes':[],'transit_lines':[],'wheelchair':None,'changing_table':None,'drinking_water':None,'free':None,'fenced':None,'elevator':None,'sources':[{'key':key,**source}],'rating':None,'review_count':0,'photo_count':0,'license_verified':True,'location_kind':'point'};rows[identity]=p;counts[d['title']]+=1
for p in rows.values():tiles[f"fallback_transit_{math.floor(p['lat']*4)}_{math.floor(p['lon']*4)}"].append(p)
index=[]
for tile,rows in sorted(tiles.items()):
 y,x=map(int,tile.split('_')[2:]);bounds=[x/4,y/4,(x+1)/4,(y+1)/4]
 for n in range(0,len(rows),2000):
  part=rows[n:n+2000];file=f'{tile}_{n//2000}.json';(OUT/file).write_text(json.dumps(part,ensure_ascii=False,separators=(',',':')));index.append({'file':file,'bounds':bounds,'count':len(part)})
(DIR/'fallback-index-039.json').write_text(json.dumps(index));(DIR/'fallback-report-039.json').write_text(json.dumps({'resource':resource,'source':source,'counts':dict(counts),'total':sum(t['count'] for t in index),'limitations':['Arrêts de la photographie nationale du 13 janvier 2026 ; aucune ligne, accessibilité ni desserte actuelle déduite.','Les autres réseaux sont fournis par les GTFS actuels lorsque disponibles.']},ensure_ascii=False,indent=2));print(sum(t['count'] for t in index),'arrêts complémentaires',len(counts),'réseaux',flush=True)
