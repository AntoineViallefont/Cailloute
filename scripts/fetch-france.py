"""Téléchargements nationaux OSM via GéoDataMine, fichiers bruts et empreintes."""
import concurrent.futures,hashlib,json,sys,zipfile
from datetime import datetime,timezone
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'donnees/france';OUT.mkdir(exist_ok=True)
THEMES=['toilets','drinking_water','playground','healthcare','library','shop_craft_office','sports','cinema']
def fetch(theme):
 url=f'https://geodatamine.fr/dump/{theme}_geojson.zip';path=OUT/f'{theme}.zip'
 if not path.exists() or '--refresh' in sys.argv:
  with requests.get(url,timeout=(20,180),stream=True) as r:
   r.raise_for_status()
   tmp=path.with_suffix('.part')
   with tmp.open('wb') as f:
    for chunk in r.iter_content(1024*1024): f.write(chunk)
   with zipfile.ZipFile(tmp) as z:
    if z.testzip():raise ValueError('Archive corrompue')
   tmp.replace(path)
 with zipfile.ZipFile(path) as z:
  name=next(n for n in z.namelist() if n.endswith(('.geojson','.json')) and 'metadata' not in n)
  j=json.loads(z.read(name)); print(theme,len(j['features']),j['features'][0],flush=True)
 return {'theme':theme,'url':url,'license':'ODbL 1.0','attribution':'© contributeurs OpenStreetMap · extraction GéoDataMine','downloaded_at':datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'features':len(j['features']),'file':path.name,'archive_entry':name}
if __name__=='__main__':
 rows=[]; errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  futures={pool.submit(fetch,t):t for t in THEMES}
  for future in concurrent.futures.as_completed(futures):
   try:rows.append(future.result())
   except Exception as e:errors.append({'theme':futures[future],'error':str(e)});print(errors[-1],flush=True)
 (OUT/'manifest.json').write_text(json.dumps({'sources':rows,'errors':errors},ensure_ascii=False,indent=2))
 if errors:sys.exit(1)

# Source touristique nationale officielle ; ne diffuse pas les contacts du CSV brut.
if __name__=='__main__':
    metadata_url='https://www.data.gouv.fr/api/1/datasets/5b598be088ee387c0c353714/'
    dataset=requests.get(metadata_url,timeout=30).json()
    if dataset.get('license') not in ('fr-lo','lov2'):raise RuntimeError('Licence DATAtourisme à vérifier')
    resource=next(r for r in dataset['resources'] if r['title']=='datatourisme-place.csv')
    path=OUT/'datatourisme-place.csv'
    if not path.exists() or '--refresh' in sys.argv:
        tmp=path.with_suffix('.part')
        with requests.get(resource['url'],timeout=(20,180),stream=True) as response:
            response.raise_for_status()
            with tmp.open('wb') as f:
                for chunk in response.iter_content(1024*1024):f.write(chunk)
        with tmp.open() as f:
            if 'URI_ID_du_POI' not in f.readline():raise ValueError('CSV touristique invalide')
        tmp.replace(path)
        (OUT/'datatourisme-source.json').write_text(json.dumps({'url':resource['url'],'license':dataset['license'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'date':datetime.now(timezone.utc).date().isoformat(),'producer':'DATAtourisme / territoires contributeurs'},indent=2))
