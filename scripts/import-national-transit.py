"""Import national reproductible GTFS : arrêts, modes/lignes vérifiés et tracés sources.
Aucun horaire ni accessibilité inventé. Les exports bruts et échecs restent traçables.
"""
import csv,json,zipfile,uuid,math,sys,hashlib,re,time,io
from pathlib import Path
from collections import defaultdict,Counter
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import date,datetime,timezone
import requests
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.france import in_france
DIR=ROOT/'donnees/france/gtfs';DIR.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'app/public/france';ROUTES=ROOT/'app/public/transit-france';ROUTES.mkdir(exist_ok=True)
TODAY=date.today().isoformat()

def mode(value):
 try:n=int(value)
 except:return None
 if n==0 or 900<=n<1000:return 'tram'
 if n==1 or 400<=n<700:return 'metro'
 if n==2 or 100<=n<200:return 'train'
 if n in (3,11) or 200<=n<300 or 700<=n<900:return 'bus'
 if n==4 or 1000<=n<1100 or 1200<=n<1300:return 'ferry'
 if n in (5,6,7,12) or 1300<=n<1500:return 'cable'
 return None

def records(z,name):
 path=next((n for n in z.namelist() if n.split('/')[-1].lower()==name),None)
 if not path:return iter(())
 return csv.DictReader(io.TextIOWrapper(z.open(path),encoding='utf-8-sig',errors='replace'))

def simplify(points,tolerance=8):
 if len(points)<3:return points
 scale=111320*math.cos(points[0][0]*math.pi/180);xy=[(p[1]*scale,p[0]*111320) for p in points];keep={0,len(points)-1};stack=[(0,len(points)-1)]
 while stack:
  a,b=stack.pop();ax,ay=xy[a];bx,by=xy[b];dx,dy=bx-ax,by-ay;l=dx*dx+dy*dy;maximum=0;index=a
  for i in range(a+1,b):
   x,y=xy[i];t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/l)) if l else 0;dist=(x-ax-t*dx)**2+(y-ay-t*dy)**2
   if dist>maximum:maximum,index=dist,i
  if maximum>tolerance*tolerance:keep.add(index);stack.extend([(a,index),(index,b)])
 return [points[i] for i in sorted(keep)]

def fetch(d,r):
 rid=r['datagouv_id'];path=DIR/f'{rid}.zip';start=time.time();source={'dataset':d['title'],'datasetId':d['id'],'resourceId':rid,'url':r['url'],'license':d['licence'],'published':r.get('updated'),'modes':r.get('modes',[])}
 try:
  if not path.exists():
   tmp=path.with_suffix('.part')
   with requests.get(r['url'],stream=True,timeout=(15,60)) as response:
    response.raise_for_status()
    with tmp.open('wb') as f:
     for block in response.iter_content(1024*1024):f.write(block)
   with zipfile.ZipFile(tmp) as z:
    if not any(n.endswith('stops.txt') for n in z.namelist()):raise ValueError('stops.txt absent')
   tmp.replace(path)
  source['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();source['bytes']=path.stat().st_size
  with zipfile.ZipFile(path) as z:
   routes={v['route_id']:v for v in records(z,'routes.txt') if mode(v.get('route_type'))};trip_routes={};shape_routes=defaultdict(set);destinations=defaultdict(set)
   for t in records(z,'trips.txt'):
    if t.get('route_id') not in routes:continue
    trip_routes[t['trip_id']]=t['route_id']
    if t.get('shape_id'):shape_routes[t['shape_id']].add(t['route_id'])
    if t.get('trip_headsign'):destinations[t['route_id']].add(t['trip_headsign'][:100])
   stop_routes=defaultdict(set)
   for t in records(z,'stop_times.txt'):
    route=trip_routes.get(t.get('trip_id'))
    if route:stop_routes[t['stop_id']].add(route)
   raw_stops={s['stop_id']:s for s in records(z,'stops.txt')};station_routes=defaultdict(set)
   for sid,rs in stop_routes.items():
    parent=raw_stops.get(sid,{}).get('parent_station')
    if parent:station_routes[parent].update(rs)
   stops=[];seen=set()
   for sid,s in raw_stops.items():
    if s.get('location_type','0') not in ('','0','1'):continue
    try:lat,lon=float(s['stop_lat']),float(s['stop_lon'])
    except:continue
    if not in_france(lat,lon):continue
    rs=stop_routes.get(sid) or station_routes.get(sid) or set();modes=sorted({mode(routes[x]['route_type']) for x in rs});lines=sorted({(routes[x].get('route_short_name') or routes[x].get('route_long_name') or '').strip()[:20] for x in rs}-{''})
    name=s.get('stop_name') or 'Arrêt de transport';dup=(name.strip().casefold(),round(lat,6),round(lon,6))
    if dup in seen:continue
    seen.add(dup);key=f'gtfs:{rid}:{sid}';parent=raw_stops.get(s.get('parent_station'),{})
    wc=s.get('wheelchair_boarding')
    if wc in ('','0',None):wc=parent.get('wheelchair_boarding') or '0'
    stops.append({'id':'p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex,'version':1,'name':name[:160],'category':'transit','lat':round(lat,7),'lon':round(lon,7),'address':'','city':'','hours':'','description':'','age':'','access':'unknown','transit_modes':modes,'transit_lines':lines,'wheelchair':True if wc=='1' else False if wc=='2' else None,'changing_table':None,'drinking_water':None,'free':None,'fenced':None,'elevator':None,'sources':[{'key':key,'name':d['title']+' · transport.data.gouv.fr','url':d['page_url'],'license':d['licence'],'retrieved_at':TODAY}],'rating':None,'review_count':0,'photo_count':0,'license_verified':True,'location_kind':'point'})
   raw_shapes=defaultdict(list)
   for s in records(z,'shapes.txt'):
    if s.get('shape_id') not in shape_routes:continue
    try:raw_shapes[s['shape_id']].append((int(s['shape_pt_sequence']),float(s['shape_pt_lat']),float(s['shape_pt_lon'])))
    except:pass
   paths=defaultdict(list)
   for shape,points in raw_shapes.items():
    points=sorted(points);points=simplify([[round(lat,5),round(lon,5)] for _,lat,lon in points])
    if len(points)>1:
     for route in shape_routes[shape]:paths[route].append(points)
   relevant={route for p in stops for route in stop_routes.get(p['sources'][0]['key'].split(':',2)[2],set())}
   route_rows=[{'id':f'gtfs:{rid}:{route}','resourceId':rid,'mode':mode(v['route_type']),'line':(v.get('route_short_name') or v.get('route_long_name') or '').strip()[:20],'color':'#'+v['route_color'] if re.fullmatch('[A-Fa-f0-9]{6}',v.get('route_color','')) else '#586170','paths':paths[route],'destinations':sorted(destinations[route])[:30]} for route,v in routes.items() if paths[route] and route in relevant]
  (ROUTES/f'{rid}.json').write_text(json.dumps({'routes':route_rows,'source':source},ensure_ascii=False,separators=(',',':')))
  (DIR/f'{rid}.stops.json').write_text(json.dumps(stops,ensure_ascii=False,separators=(',',':')))
  source.update(stops=len(stops),routes=len(route_rows),status='ok',seconds=round(time.time()-start));return source
 except Exception as e:source.update(status='failed',error=str(e)[:300]);return source

def main():
 catalog=requests.get('https://transport.data.gouv.fr/api/datasets',timeout=45).json();(DIR/'catalogue.json').write_text(json.dumps(catalog,ensure_ascii=False));tasks=[];skipped=[];seen=set()
 for d in catalog:
  for r in d.get('resources',[]):
   if r.get('format','').lower()!='gtfs':continue
   reason=None
   if r.get('modes') and all(m in ('air','taxi') for m in r['modes']):reason='mode hors sélection familiale'
   elif d.get('licence') not in ('lov2','fr-lo','odc-odbl'):reason='licence non prise en charge'
   elif not r.get('is_available'):reason='ressource indisponible'
   elif (r.get('metadata',{}).get('end_date') or '9999')<TODAY:reason='offre périmée'
   elif (r.get('metadata',{}).get('start_date') or '0000')>TODAY:reason='offre future'
   if reason:skipped.append({'dataset':d['title'],'resourceId':r.get('datagouv_id'),'reason':reason});continue
   if r['datagouv_id'] not in seen:seen.add(r['datagouv_id']);tasks.append((d,r))
 print('Ressources à traiter',len(tasks),flush=True);results=[]
 with ThreadPoolExecutor(max_workers=4) as pool:
  futures=[pool.submit(fetch,d,r) for d,r in tasks]
  for f in as_completed(futures):
   result=f.result();results.append(result)
   (DIR/'progress.json').write_text(json.dumps({'completed':len(results),'total':len(tasks),'failures':sum(r['status']=='failed' for r in results),'results':results},ensure_ascii=False))
   if len(results)%20==0 or result['status']=='failed':print(len(results),len(tasks),result['dataset'],result['status'],result.get('error',''),flush=True)
 assemble(results,skipped)

def assemble(results,skipped):
 tiles=defaultdict(list);unique=set();counts=Counter()
 for result in results:
  if result['status']!='ok' or (result.get('modes') and all(m in ('air','taxi') for m in result['modes'])):continue
  for p in json.loads((DIR/(result['resourceId']+'.stops.json')).read_text()):
   # Plusieurs feeds peuvent publier le même quai : conserver les sources et lignes ensemble.
   key=(p['name'].strip().casefold(),round(p['lat'],6),round(p['lon'],6));tile=f"transit_{math.floor(p['lat']*4)}_{math.floor(p['lon']*4)}";tiles[tile].append(p)
 index=json.loads((OUT/'index.json').read_text());index['tiles']=[t for t in index['tiles'] if not t['file'].startswith('transit_')]
 all_count=0;corse=0
 for tile,rows in sorted(tiles.items()):
  dedup={}
  for p in sorted(rows,key=lambda p:p['sources'][0]['key']):
   k=(p['name'].strip().casefold(),round(p['lat'],6),round(p['lon'],6))
   if k in dedup:
    old=dedup[k];old['sources']+=p['sources'];old['transit_modes']=sorted(set(old['transit_modes']+p['transit_modes']));old['transit_lines']=sorted(set(old['transit_lines']+p['transit_lines']));
    if old['wheelchair']!=p['wheelchair']:old['wheelchair']=None
   else:dedup[k]=p
  rows=list(dedup.values());y,x=map(int,tile.split('_')[1:]);bounds=[x/4,y/4,(x+1)/4,(y+1)/4]
  # Fichiers de 2 000 arrêts maximum pour conserver des lectures modestes.
  for n in range(0,len(rows),2000):
   part=rows[n:n+2000];file=f'{tile}_{n//2000}.json';(OUT/file).write_text(json.dumps(part,ensure_ascii=False,separators=(',',':')));index['tiles'].append({'file':file,'bounds':bounds,'count':len(part)})
  all_count+=len(rows);corse+=sum(41<p['lat']<43.1 and 8<p['lon']<10 for p in rows)
 index.update(version=TODAY+'-039',total=sum(t['count'] for t in index['tiles']));(OUT/'index.json').write_text(json.dumps(index,separators=(',',':')))
 report={'date':TODAY,'scope':'France métropolitaine et Corse','stops':all_count,'corseStops':corse,'resources':results,'skipped':skipped,'limitations':['Couverture des ressources GTFS publiques recensées et disponibles, pas garantie d’exhaustivité de tous les réseaux.','Pas d’horaires importés ni de temps réel.','Mode et ligne issus de routes.txt + trips.txt + stop_times.txt ; inconnus conservés comme inconnus.','Tracés issus uniquement de shapes.txt, jamais des segments inventés entre arrêts.','wheelchair_boarding indique l’embarquement à cet arrêt, pas tout l’itinéraire ni tous les véhicules.']};(DIR/'rapport.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('Terminé',all_count,'arrêts dont',corse,'en Corse',flush=True)
if __name__=='__main__':main()
