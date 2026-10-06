"""Collecte reproductible des liens OSM de lieux, France continentale et Corse."""
import json,urllib.request,urllib.parse,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[1];folder=root/'donnees/enrichissement-ouvert';folder.mkdir(parents=True,exist_ok=True)
topics={
 'stations':[('railway','station')],
 'museums':[('tourism','museum')],
 'family':[('tourism','zoo'),('tourism','aquarium'),('tourism','theme_park'),('leisure','park'),('leisure','garden'),('leisure','water_park'),('leisure','playground'),('amenity','library')],
 'services':[('amenity','toilets'),('amenity','drinking_water'),('amenity','pharmacy'),('amenity','hospital'),('amenity','clinic')],
}
results=[]
for topic,filters in topics.items():
 out=folder/f'national-{topic}-links.json'
 if out.exists():
  data=json.loads(out.read_text());results.append({'topic':topic,'cached':True,'elements':len(data['elements']),'partial':bool(data.get('remark'))});continue
 # Les géométries massives ne sont pas nécessaires : les liens nouveaux exigent
 # nom exact, catégorie et coordonnées Wikidata à 30 m maximum, sans ambiguïté.
 query='[out:json][timeout:90];('+''.join('nwr["'+key+'"="'+value+'"]["wikidata"](41.3,-5.3,51.2,9.7);' for key,value in filters)+');out tags;'
 try:
  url='https://overpass-api.de/api/interpreter?'+urllib.parse.urlencode({'data':query})
  req=urllib.request.Request(url,headers={'User-Agent':'CaillouteOpenCatalog/1.0 (offline French public-place enrichment)','Accept':'application/json'})
  with urllib.request.urlopen(req,timeout=110) as response:raw=response.read(50_000_001)
  if len(raw)>50_000_000:raise ValueError('Réponse trop volumineuse')
  data=json.loads(raw)
  if not isinstance(data.get('elements'),list):raise ValueError('Réponse OSM invalide')
  # Une réponse partielle reste exploitable élément par élément et est signalée.
  out.write_bytes(raw)
  out.with_suffix('.source.json').write_text(json.dumps({'date':datetime.now(timezone.utc).isoformat(),'url':url.split('?')[0],'query':query,'license':'ODbL 1.0','partial':bool(data.get('remark')),'sha256':hashlib.sha256(raw).hexdigest()},indent=2))
  results.append({'topic':topic,'cached':False,'elements':len(data['elements']),'partial':bool(data.get('remark'))})
 except Exception as error:results.append({'topic':topic,'error':str(error)[:200]})
 print(json.dumps(results[-1]),flush=True)
(folder/'links-report.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results),flush=True)
