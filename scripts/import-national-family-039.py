"""Compléments nationaux utiles aux familles : lieux culturels ouverts, piscines publiques.
Les contacts, descriptions libres et images des sources ne sont pas redistribués.
"""
import requests,json,csv,math,uuid,sys,hashlib,zipfile,re,unicodedata
from pathlib import Path
from collections import defaultdict,Counter
from datetime import date
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.france import in_france
DIR=ROOT/'donnees/france';OUT=ROOT/'app/public/france';TODAY=date.today().isoformat();tiles=defaultdict(list);stats=Counter();sources=[]
def download(url,path,params=None):
 if not path.exists():
  with requests.get(url,params=params,stream=True,timeout=(20,90)) as r:
   r.raise_for_status();tmp=path.with_suffix('.part')
   with tmp.open('wb') as f:
    for block in r.iter_content(1024*1024):f.write(block)
   tmp.replace(path)
 return path

def normal(v):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFD',v.casefold()).encode('ascii','ignore').decode())
existing=defaultdict(list)
for path in [*OUT.glob('*.json'),*(ROOT/'app/public').glob('catalog-*.json'),ROOT/'app/public/seed.json']:
 if path.name=='index.json' or path.name.startswith(('transit_','family039_')):continue
 rows=json.loads(path.read_text())
 if not isinstance(rows,list):continue
 for p in rows:existing[(p.get('category'),normal(p.get('name','')))].append(p)

def add(key,name,lat,lon,activity,source,city='',address='',website='',**extra):
 if not in_france(lat,lon):stats['hors_france_corse']+=1;return
 for old in existing.get(('child_activity',normal(name)),[]):
  if math.hypot((old['lat']-lat)*111320,(old['lon']-lon)*111320*math.cos(lat*math.pi/180))<30:stats['doublon_existant']+=1;return
 p={'id':'p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex,'version':1,'name':name[:160],'category':'child_activity','lat':round(lat,7),'lon':round(lon,7),'address':address[:300],'city':city[:100],'hours':'','description':'','age':'','access':'unknown','activity_type':activity,'wheelchair':None,'changing_table':None,'drinking_water':None,'free':None,'fenced':None,'elevator':None,'sources':[{'key':key,**source}],'rating':None,'review_count':0,'photo_count':0,'license_verified':True,'location_kind':'point',**extra}
 if isinstance(website,dict):website=website.get('url') or website.get('href') or next((v for v in website.values() if isinstance(v,str) and v.startswith(('http://','https://'))),'')
 if website and not re.search(r'\s',website):p['website']=website if website.startswith(('http://','https://')) else 'https://'+website
 tile=f"family039_{math.floor(lat*4)}_{math.floor(lon*4)}";tiles[tile].append(p);existing[('child_activity',normal(name))].append(p);stats[activity]+=1

# Base nationale actuelle du ministère de la Culture, licence ODbL vérifiée via data.gouv.
u='https://www.data.gouv.fr/api/1/datasets/base-des-lieux-culturels-ouverts/';meta=requests.get(u,timeout=30).json();assert meta['license']=='odc-odbl';r=next(r for r in meta['resources'] if r.get('format')=='csv');path=download(r['url'],DIR/'lieux-culturels-039.csv')
source={'name':'Ministère de la Culture · lieux culturels ouverts','url':'https://www.data.gouv.fr/datasets/base-des-lieux-culturels-ouverts','license':'ODbL 1.0','retrieved_at':TODAY};sources.append({**source,'download':r['url'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
with path.open(encoding='utf-8-sig',newline='') as f:
 for row in csv.DictReader(f,delimiter=';'):
  label=(row.get('sous_domaines_noms_publics') or '')+' '+(row.get('types_noms_publics') or '')
  activity=next((name for pattern,name in [('biblioth','Bibliothèque'),('musée','Musée'),('musee','Musée'),('théâtre','Théâtre'),('theatre','Théâtre'),('cinéma','Cinéma'),('cinema','Cinéma'),('parc et jardin','Parc / jardin')] if pattern in label.casefold()),None)
  if not activity:stats['culture_hors_selection']+=1;continue
  if re.search(r'ferm[eé]|non ouvert',row.get('accessible_au_public') or '',re.I):stats['culture_ferme']+=1;continue
  try:lat,lon=float(row['latitude']),float(row['longitude'])
  except:stats['culture_sans_coordonnees']+=1;continue
  links=[]
  try:links=json.loads(row.get('site_internet_et_autres_liens') or '[]')
  except:pass
  add('culture:'+row['id'],row.get('nom_usuel_du_lieu') or row['nom_du_lieu'],lat,lon,activity,source,city=row.get('commune') or '',address=row.get('adresse_entree_public') or row.get('adresse_complete') or '',website=links[0] if links else '')
# Data ES : piscine accueillant explicitement les individus/familles, pas un bassin club seul.
base='https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es';meta=requests.get(base,timeout=30).json();assert 'OUVERTE' in meta['metas']['default']['license'].upper();where='search(equip_type_name, "bassin") or search(equip_type_name, "piscine") or search(equip_type_name, "aquatique")';path=download(base+'/exports/json',DIR/'piscines-data-es-039.json',{'where':where})
source={'name':'Ministère des Sports · Data ES','url':'https://equipements.sports.gouv.fr/explore/dataset/data-es/','license':'Licence Ouverte 2.0','retrieved_at':TODAY};sources.append({**source,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
groups=defaultdict(list)
for row in json.loads(path.read_text()):
 if row.get('inst_hs_bool') in ('true',True):stats['piscine_hors_service']+=1;continue
 if not ('individuel' in str(row.get('equip_utilisateur')).casefold() or row.get('equip_acc_libre') in ('true',True)):stats['piscine_usage_non_familial']+=1;continue
 if 'prive' in str(row.get('equip_type_name')).casefold():stats['piscine_privee']+=1;continue
 if not row.get('equip_coordonnees'):stats['piscine_sans_coordonnees']+=1;continue
 groups[row.get('inst_numero') or row['equip_numero']].append(row)
for ident,rows in groups.items():
 row=rows[0];coord=row['equip_coordonnees'];pmr=all(row.get(k) in ('true',True) for k in ['equip_pmr_acc','equip_pmr_chem','equip_pmr_aire']);add('data-es:'+ident,row.get('inst_nom') or row.get('equip_nom') or 'Piscine',coord['lat'],coord['lon'],'Piscine',source,city=row.get('new_name') or '',address=row.get('inst_adresse') or '',website=row.get('equip_url') or '',wheelchair=True if pmr else None,toilets_available=True if row.get('equip_sanit') in ('true',True) else None)
# Corriger les bornes OSM : un âge minimum seul ne signifie pas un âge exact.
with zipfile.ZipFile(DIR/'playground.zip') as z:raw=json.loads(z.read('data.geojson'))['features']
ages={}
for f in raw:
 t=f['properties'];lo=t.get('min_age');hi=t.get('max_age')
 if lo is not None and lo!='' and hi is not None and hi!='':age=f'{lo}–{hi} ans'
 elif lo is not None and lo!='':age=f'À partir de {lo} ans'
 elif hi is not None and hi!='':age=f'Jusqu’à {hi} ans'
 else:continue
 ages['osm:'+t['osm_id']]=age
for path in OUT.glob('*.json'):
 if path.name=='index.json' or path.name.startswith(('transit_','family039_')):continue
 rows=json.loads(path.read_text());changed=False
 for p in rows:
  if p.get('category')=='playground':
   age=next((ages[s['key']] for s in p.get('sources',[]) if s['key'] in ages),None)
   if age and p.get('age')!=age:p['age']=age;changed=True;stats['ages_corriges']+=1
 if changed:path.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
index=[]
for tile,rows in sorted(tiles.items()):
 y,x=map(int,tile.split('_')[1:]);bounds=[x/4,y/4,(x+1)/4,(y+1)/4]
 for n in range(0,len(rows),2000):
  part=rows[n:n+2000];file=f'{tile}_{n//2000}.json';(OUT/file).write_text(json.dumps(part,ensure_ascii=False,separators=(',',':')));index.append({'file':file,'bounds':bounds,'count':len(part)})
(DIR/'family-index-039.json').write_text(json.dumps(index));(DIR/'family-report-039.json').write_text(json.dumps({'date':TODAY,'scope':'France métropolitaine et Corse','counts':dict(stats),'sources':sources,'total':sum(t['count'] for t in index),'limitations':['Les lieux culturels ne garantissent ni séance ni programmation adaptée à un âge ; les âges non renseignés restent inconnus.','Les tables à langer, tarifs, horaires et offres enfants ne sont renseignés que sur preuve explicite.','Pas de noms individuels de professionnels, contacts privés, photos ou descriptions importés.']},ensure_ascii=False,indent=2));print(json.dumps(dict(stats),ensure_ascii=False),flush=True)
