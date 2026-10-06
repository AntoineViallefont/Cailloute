"""Import ponctuel RPPS/ANS des pédiatres libéraux ; aucune modification des lieux existants."""
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor
import json, math, hashlib, argparse, csv, io, time
ROOT=Path(__file__).resolve().parents[1]
DATASET='https://www.data.gouv.fr/api/1/datasets/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps/'
PUBLIC='https://www.data.gouv.fr/datasets/annuaire-sante-extractions-des-donnees-en-libre-acces-des-professionnels-intervenant-dans-le-systeme-de-sante-rpps'
DATE='2026-09-16'
def get(url):
    with urlopen(url,timeout=60) as r:return json.load(r)
def distance(lat,lon):
    r=math.pi/180;h=math.sin((lat-45.7578)*r/2)**2+math.cos(lat*r)*math.cos(45.7578*r)*math.sin((lon-4.832)*r/2)**2
    return 12742017.6*math.asin(min(1,math.sqrt(h)))
def extract():
    metadata=get(DATASET);assert metadata['license']=='lov2'
    url=next(r['url'] for r in metadata['resources'] if 'activite' in r['title'])
    rows=[]
    with urlopen(url,timeout=120) as response:
        for row in csv.DictReader(io.TextIOWrapper(response,encoding='utf-8-sig'),delimiter='|'):
            if row['Code profession']=='10' and row['Code type savoir-faire']=='S' and row['Code savoir-faire'] in ['SM40','SM87','SM88','SM89','SM90'] and row['Code mode exercice']=='L' and row['Code commune (coord. structure)'][:2] in ['69','01','38','42']:
                # Pas de copie des téléphones, courriels et données inutiles.
                keys=['Identifiant PP',"Nom d'exercice","Prénom d'exercice",'Code type savoir-faire','Code savoir-faire','Libellé savoir-faire','Code mode exercice','Raison sociale site','Numéro Voie (coord. structure)','Indice répétition voie (coord. structure)','Libellé type de voie (coord. structure)','Libellé Voie (coord. structure)','Code postal (coord. structure)','Libellé commune (coord. structure)','Code commune (coord. structure)']
                rows.append({key:row[key] for key in keys})
    return rows
parser=argparse.ArgumentParser();parser.add_argument('--input');args=parser.parse_args()
rows=json.loads(Path(args.input).read_text()) if args.input else extract()
with ThreadPoolExecutor(max_workers=4) as pool:
    communes=[c for group in pool.map(lambda dep:get('https://geo.api.gouv.fr/communes?'+urlencode({'codeDepartement':dep,'fields':'code,nom,centre'})),['69','01','38','42']) for c in group]
near={c['code'] for c in communes if c.get('centre') and distance(c['centre']['coordinates'][1],c['centre']['coordinates'][0])<38000}
near.update('6938'+str(i) for i in range(1,10))
groups={}
for row in rows:
    code=row['Code commune (coord. structure)']
    if row['Code mode exercice']!='L' or code not in near:continue
    address=' '.join(row[k].strip() for k in ['Numéro Voie (coord. structure)','Indice répétition voie (coord. structure)','Libellé type de voie (coord. structure)','Libellé Voie (coord. structure)'] if row[k].strip())
    if not address:continue
    key=(code,address.upper(),row['Code postal (coord. structure)'])
    groups.setdefault(key,[]).append(row)
cachepath=ROOT/'donnees/geocodage-sante-015.json'
cache=json.loads(cachepath.read_text()) if cachepath.exists() else {}
output=[];rejected=[]
for (code,address,postcode),members in groups.items():
    first=members[0];city=first['Libellé commune (coord. structure)'];query=f'{address} {postcode} {city}'
    if query not in cache:
        try:cache[query]=get('https://data.geopf.fr/geocodage/search?'+urlencode({'q':query,'limit':1}))
        except Exception as error:rejected.append({'address':query,'reason':str(error)});continue
        time.sleep(.08)
    features=cache[query].get('features',[])
    if not features:rejected.append({'address':query,'reason':'no result'});continue
    f=features[0];p=f['properties'];lon,lat=f['geometry']['coordinates']
    citycode=p.get('citycode','');citymatch=citycode==code or (code=='69123' and citycode.startswith('6938'))
    exact_number=not first['Numéro Voie (coord. structure)'] or (p.get('type')=='housenumber' and str(p.get('housenumber','')).split()[0].lstrip('0')==first['Numéro Voie (coord. structure)'].lstrip('0'))
    if p.get('score',0)<.8 or not citymatch or not exact_number or distance(lat,lon)>30000:
        rejected.append({'address':query,'reason':'precision, commune or distance','match':p});continue
    practitioners={r['Identifiant PP']:r for r in members}
    names=sorted({f"Dr {r['Prénom d\'exercice'].title()} {r['Nom d\'exercice'].title()}" for r in practitioners.values()})
    name=names[0]+' — Pédiatre' if len(names)==1 else 'Pédiatres — '+p['name']
    ident=hashlib.sha256((code+'|'+address+'|'+postcode).encode()).hexdigest()[:16]
    output.append(dict(id='p_rpps015_'+ident,version=1,name=name,category='health',health_type='doctor',pediatric=True,lat=lat,lon=lon,address=p['name'],city=p['city'],hours='',description='Pédiatrie · activité libérale déclarée dans l’Annuaire Santé.\n'+'\n'.join(names),website='https://annuaire.sante.fr/',age='',access='unknown',wheelchair=None,changing_table=None,drinking_water=None,free=None,fenced=None,elevator=None,rating=None,review_count=0,license_verified=True,information_validated=False,location_kind='address',sources=[dict(key='rpps:'+ident,name='Agence du Numérique en Santé · RPPS, extraction du 15 septembre 2026',url=PUBLIC,license='Licence Ouverte 2.0',retrieved_at=DATE),dict(key='ban:'+ident,name='BAN / IGN · géocodage de l’adresse professionnelle',url='https://adresse.data.gouv.fr',license='Licence Ouverte 2.0',retrieved_at=DATE)]))
cachepath.write_text(json.dumps(cache,ensure_ascii=False,indent=2))
(ROOT/'app/public/catalog-health-015.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
report={'date':DATE,'source':PUBLIC,'license':'Licence Ouverte 2.0','places':len(output),'addresses_examined':len(groups),'rejected':rejected,'notes':['Import ponctuel de pédiatres libéraux, spécialité RPPS S/SM40 ou options SM87–SM90.','30 km autour de Lyon. Numéro et commune de géocodage contrôlés, score >= 0.8.','Regroupement initial par adresse uniquement. Ne modifie aucune contribution existante.','Ne garantit ni disponibilité ni acceptation de nouveaux patients. Pas de données de contact collectées.']}
(ROOT/'donnees/rapport-sante-015.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'places':len(output),'addresses':len(groups),'rejected':len(rejected)},ensure_ascii=False))
