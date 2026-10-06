"""Complète les commerces familiaux par enseignes explicitement spécialisées.
La présence d'un magasin ne garantit pas son stock ni ses horaires du jour.
"""
import json,zipfile,uuid,math,sys,re,unicodedata
from pathlib import Path
from collections import defaultdict,Counter
from datetime import date
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.france import in_france
DIR=ROOT/'donnees/france';OUT=ROOT/'app/public/france';tiles=defaultdict(list);counts=Counter();TODAY=date.today().isoformat()
manifest=json.loads((DIR/'manifest.json').read_text());source=next(s for s in manifest['sources'] if s['theme']=='shop_craft_office');existing=set()
for path in [*OUT.glob('*.json'),ROOT/'app/public/seed.json',*(ROOT/'app/public').glob('catalog-*.json')]:
 if path.name=='index.json' or path.name.startswith(('transit_','fallback_transit_','shops039_')):continue
 rows=json.loads(path.read_text())
 if isinstance(rows,list):existing.update(s['key'] for p in rows for s in p.get('sources',[]))
brands=[(r'\bokaidi\b|\bobaibi\b','https://www.okaidi.fr/','children'),(r'\bjacadi\b','https://www.jacadi.fr/','children'),(r'\bpetit bateau\b','https://www.petit-bateau.fr/','children'),(r'\borchestra\b','https://fr.shop-orchestra.com/fr/accueil','children'),(r'\bbiocoop\b','https://www.biocoop.fr/','organic'),(r'\bnaturalia\b','https://www.naturalia.fr/','organic'),(r'\bla vie claire\b','https://www.lavieclaire.com/','organic')]
with zipfile.ZipFile(DIR/source['file']) as z:features=json.loads(z.read(source['archive_entry']))['features']
def center(g):
 if g['type']=='Point':return g['coordinates'][:2],False
 def flat(x):
  if isinstance(x[0],(int,float)):yield x[:2]
  else:
   for a in x:yield from flat(a)
 pts=list(flat(g['coordinates']));return [(min(x[0] for x in pts)+max(x[0] for x in pts))/2,(min(x[1] for x in pts)+max(x[1] for x in pts))/2],True
for f in features:
 t=f['properties'];typ=t.get('type')
 if typ not in ('clothes','supermarket','convenience','health_food','greengrocer'):continue
 text=unicodedata.normalize('NFD',(str(t.get('brand') or '')+' '+str(t.get('name') or '')).casefold());text=''.join(c for c in text if not unicodedata.combining(c));text=re.sub('[^a-z0-9]+',' ',text)
 selected=next(((url,kind) for pattern,url,kind in brands if re.search(pattern,text)),None)
 if not selected:continue
 url,kind=selected
 if kind=='children' and typ!='clothes':continue
 if kind=='organic' and typ=='clothes':continue
 key='osm:'+t['osm_id']
 if key in existing:counts['deja_present']+=1;continue
 (lon,lat),approx=center(f['geometry'])
 if not in_france(lat,lon):continue
 existing.add(key);category='baby_shop' if kind=='children' else 'food_shop';p={'id':'p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex,'version':1,'name':t.get('name') or t.get('brand'),'category':category,'lat':round(lat,7),'lon':round(lon,7),'address':t.get('address') or '', 'city':t.get('com_nom') or '', 'hours':t.get('opening_hours') or '', 'description':'','age':'','access':'unknown','shop_type':typ,'children_clothes':True if kind=='children' else None,'organic':True if kind=='organic' else None,'baby_food':None,'wheelchair':True if t.get('wheelchair')=='yes' else False if t.get('wheelchair')=='no' else None,'changing_table':None,'drinking_water':None,'free':None,'fenced':None,'elevator':None,'website':t.get('website') or url,'sources':[{'key':key,'name':'OpenStreetMap · GéoDataMine','url':'https://www.openstreetmap.org/'+t['osm_id'],'license':'ODbL 1.0','retrieved_at':source['downloaded_at']},{'key':'brand:'+url,'name':'Enseigne · offre enfant ou bio','url':url,'license':'Faits publics sur l’enseigne','retrieved_at':TODAY}],'rating':None,'review_count':0,'photo_count':0,'license_verified':True,'location_kind':'approximate_center' if approx else 'point'}
 tiles[f"shops039_{math.floor(lat*4)}_{math.floor(lon*4)}"].append(p);counts[kind]+=1
index=[]
for tile,rows in sorted(tiles.items()):
 y,x=map(int,tile.split('_')[1:]);file=tile+'.json';(OUT/file).write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')));index.append({'file':file,'bounds':[x/4,y/4,(x+1)/4,(y+1)/4],'count':len(rows)})
(DIR/'shops-index-039.json').write_text(json.dumps(index));(DIR/'shops-report-039.json').write_text(json.dumps({'counts':dict(counts),'date':TODAY,'scope':'France métropolitaine et Corse','limitations':['Classification par enseignes spécialisées, pas un inventaire du stock de chaque magasin.','Les magasins généralistes sans rayon enfant explicite restent exclus ; aucune offre bébé ni certification bio déduite d’un nom approximatif.','Les nouveaux exports Overpass ne sont pas disponibles pendant cette mise à jour ; positions issues de l’extraction GéoDataMine existante.']},ensure_ascii=False,indent=2));print(dict(counts))
