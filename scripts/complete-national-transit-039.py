"""Récupération du GTFS publié en fichiers séparés et des stations ferroviaires corses."""
import importlib.util,json,zipfile,requests
from pathlib import Path
spec=importlib.util.spec_from_file_location('national',Path(__file__).with_name('import-national-transit.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
report=json.loads((m.DIR/'rapport.json').read_text());catalog=json.loads((m.DIR/'catalogue.json').read_text());results={r['resourceId']:r for r in report['resources']};skipped=report['skipped']
for d in catalog:
 if d['title']=='Réseau urbain Mobilité en Velay':
  r=next(r for r in d['resources'] if r.get('format','').lower()=='gtfs');base=r['original_url'];path=m.DIR/(r['datagouv_id']+'.zip')
  with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
   for file in ['agency.txt','calendar.txt','calendar_dates.txt','feed_info.txt','routes.txt','shapes.txt','stop_times.txt','stops.txt','trips.txt']:
    response=requests.get(base+file,timeout=(20,60));response.raise_for_status();z.writestr(file,response.content)
  result=m.fetch(d,r);result['downloadMethod']='Fichiers GTFS séparés publiés par le producteur';results[result['resourceId']]=result;print(d['title'],result['status'],result.get('stops'))
 if d['title']=='Réseau interurbain des Chemins de fer Corse':
  r=next(r for r in d['resources'] if r.get('format','').lower()=='gtfs');assert d['licence'] in ('lov2','fr-lo','odc-odbl');result=m.fetch(d,r)
  if result['status']=='ok':
   path=m.DIR/(result['resourceId']+'.stops.json');stops=json.loads(path.read_text())
   for p in stops:p['transit_lines']=[]
   path.write_text(json.dumps(stops,ensure_ascii=False,separators=(',',':')))
   (m.ROUTES/(result['resourceId']+'.json')).write_text(json.dumps({'routes':[],'source':result}))
   result.update(routes=0,historicalStopsOnly=True);results[result['resourceId']]=result;skipped=[x for x in skipped if x['resourceId']!=result['resourceId']];print(d['title'],result['stops'],'stations, sans horaires ni tracés déduits du calendrier expiré')
m.assemble(list(results.values()),skipped)
