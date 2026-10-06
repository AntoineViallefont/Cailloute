"""Filtre les exports nationaux et construit les lots géographiques de Cailloute."""
import json,zipfile,uuid,math,sys
from pathlib import Path
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.france import in_france
DIR=ROOT/'donnees/france';OUT=ROOT/'app/public/france';OUT.mkdir(exist_ok=True)
manifest=json.loads((DIR/'manifest.json').read_text());tiles=defaultdict(dict);counts=Counter();excluded=Counter();seen=set()
existing={s['key']:p['id'] for fn in ['seed.json','catalog-017.json','catalog-health-015.json','catalog-toilets-017.json','catalog-family-017.json'] for p in json.loads((ROOT/'app/public'/fn).read_text()) for s in p.get('sources',[])}
def tri(v):return True if v in ('yes',True) else False if v in ('no',False) else None
def center(g):
 if g['type']=='Point':return g['coordinates'][:2],False
 # Le centre de l'enveloppe indique une position approchée, jamais une entrée garantie.
 def flat(x):
  if isinstance(x[0],(int,float)):yield x[:2]
  else:
   for a in x:yield from flat(a)
 pts=list(flat(g['coordinates']));return [(min(p[0] for p in pts)+max(p[0] for p in pts))/2,(min(p[1] for p in pts)+max(p[1] for p in pts))/2],True
for source in manifest['sources']:
 theme=source['theme']
 with zipfile.ZipFile(DIR/source['file']) as z: features=json.loads(z.read(source['archive_entry']))['features']
 for f in features:
  t=f['properties'];typ=t.get('type');category=None;activity='';health=''
  if theme in ('toilets','drinking_water','playground'):category={'toilets':'toilet','drinking_water':'water','playground':'playground'}[theme]
  elif theme=='healthcare':
   if typ=='pharmacy':category='health';health='pharmacy'
   elif typ in ('hospital','clinic') and t.get('emergency')=='yes':category='health';health='emergency'
   elif 'paediatr' in str(t.get('speciality')):category='health';health='doctor'
  elif theme=='library' and typ=='library':category='child_activity';activity='Bibliothèque'
  elif theme=='cinema':category='child_activity';activity='Cinéma'
  elif theme=='sports' and (typ=='water_park' or (typ=='sports_centre' and t.get('sport')=='swimming' and t.get('name'))):category='child_activity';activity='Centre aquatique' if typ=='sports_centre' else 'Parc aquatique'
  elif theme=='shop_craft_office':
   if typ in ('supermarket','convenience'):category='food_shop'
   elif typ=='baby_goods':category='baby_shop'
  if not category:excluded['hors_selection']+=1;continue
  (lon,lat),approx=center(f['geometry']);code=str(t.get('com_insee') or '')
  if not in_france(lat,lon):excluded['hors_metropole_corse']+=1;continue
  osm=t.get('osm_id');key='osm:'+str(osm)
  if not osm or key in seen:excluded['doublon']+=1;continue
  seen.add(key);ident=existing.get(key,'p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex)
  # Les anciens lieux restent prioritaires, donc aucune correction locale n'est remplacée.
  if key in existing:excluded['deja_catalogue']+=1;continue
  labels={'toilet':'Toilettes','water':'Point d’eau potable','playground':'Aire de jeux','health':'Pharmacie' if health=='pharmacy' else 'Pédiatre' if health=='doctor' else 'Urgences','child_activity':activity,'food_shop':'Alimentation','baby_shop':'Magasin bébé / enfant'}
  d={'id':ident,'version':1,'name':t.get('name') or t.get('brand') or labels[category],'category':category,'lat':round(lat,7),'lon':round(lon,7),'address':t.get('address') or '', 'city':t.get('com_nom') or '', 'hours':t.get('opening_hours') or '', 'description':'','age':'–'.join(str(t[x]) for x in ['min_age','max_age'] if t.get(x)), 'access':{'yes':'public','no':'private'}.get(t.get('access'),t.get('access') or 'unknown'),'wheelchair':tri(t.get('wheelchair')),'changing_table':tri(t.get('changing_table')),'drinking_water':True if category=='water' else tri(t.get('drinking_water')),'free':not tri(t['fee']) if tri(t.get('fee')) is not None else None,'fenced':None,'elevator':None,'sources':[{'key':key,'name':'OpenStreetMap · GéoDataMine','url':'https://www.openstreetmap.org/'+osm,'license':'ODbL 1.0','retrieved_at':source['downloaded_at']}],'rating':None,'review_count':0,'photo_count':0,'license_verified':True,'location_kind':'approximate_center' if approx else 'point'}
  if activity:d['activity_type']=activity
  if health:d.update(health_type=health,pediatric=True if health=='doctor' else None)
  if theme=='shop_craft_office':d['shop_type']=typ
  if category=='toilet':d['toilets_available']=True
  if t.get('website'):d['website']=t['website']
  tile=f'{math.floor(lat)}_{math.floor(lon)}';tiles[tile][ident]=d;counts[category]+=1
index=[]
for key,rows in sorted(tiles.items()):
 data=list(rows.values());(OUT/(key+'.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 y,x=map(int,key.split('_'));index.append({'file':key+'.json','bounds':[x,y,x+1,y+1],'count':len(data)})
report={'date':'2026-09-16','scope':'France métropolitaine et Corse','sources':manifest['sources'],'total':sum(counts.values()),'categories':dict(counts),'excluded':dict(excluded),'tiles':index,'limitations':['Base collaborative non exhaustive ; informations et accès à confirmer sur place.','Gratuité, accessibilité et offre enfant restent inconnues sans source explicite.','Bibliothèques, cinémas et piscines : vérifier les âges et séances auprès du lieu.','Pas de noms de professionnels individuels, téléphones, courriels, images ni avis importés.']}
(DIR/'rapport.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(OUT/'index.json').write_text(json.dumps({'version':'2026-09-16','total':report['total'],'tiles':index},separators=(',',':')))
print(json.dumps({k:v for k,v in report.items() if k not in ('sources','tiles')},ensure_ascii=False,indent=2))
