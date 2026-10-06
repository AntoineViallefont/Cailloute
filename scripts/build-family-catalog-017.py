"""Complément ponctuel, reproductible depuis les sources archivées. Aucun téléchargement.
Ne réécrit ni le catalogue initial ni les contributions des utilisateurs.
"""
from pathlib import Path
import csv, json, math, hashlib, re, unicodedata
from collections import Counter
ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-09-16'
def read(path): return json.loads((ROOT/path).read_text())
def write(path, data): (ROOT/path).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def distance(a,b):
    rad=math.pi/180
    h=math.sin((a['lat']-b['lat'])*rad/2)**2+math.cos(a['lat']*rad)*math.cos(b['lat']*rad)*math.sin((a['lon']-b['lon'])*rad/2)**2
    return 12742017.6*math.asin(min(1,math.sqrt(h)))
def norm(s): return re.sub(r'[^a-z0-9]+',' ',''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c))).strip()
def source(key,name,url,license='Licence Ouverte 2.0'):return dict(key=key,name=name,url=url,license=license,retrieved_at=DATE)
def metadata_source(slug,key):
    m=read('donnees/metadonnees/'+slug+'.json');assert m['license']=='lov2'
    return source(key,m['title'],'https://www.data.gouv.fr/datasets/'+slug)
def place(key,name,category,lon,lat,**extra):
    p=dict(id='p_family017_'+hashlib.sha256(key.encode()).hexdigest()[:18],version=1,name=name,category=category,lon=lon,lat=lat,address='',city='',hours='',description='',age='',access='unknown',wheelchair=None,changing_table=None,drinking_water=None,free=None,fenced=None,elevator=None,rating=None,review_count=0,information_validated=False,license_verified=True,sources=[])
    p.update(extra);return p
baseline=sum([read('app/public/'+f) for f in ['seed.json','catalog-017.json','catalog-health-015.json','catalog-toilets-017.json']],[])
by_source={s['key']:p for p in baseline for s in p.get('sources',[])}
additions=[]; patches={}; rejected=[]; matched=[]
def patch(p,values,srcs):
    d=patches.setdefault(p['id'],{})
    for k,v in values.items():
        if v is not None and (p.get(k) is None or k=='toilet_public'): d[k]=v
    d['sources']=list({s['key']:s for s in d.get('sources',[])+srcs}.values())
def add(p):
    if not all(math.isfinite(p[k]) for k in ['lat','lon']) or distance(p,dict(lat=45.7578,lon=4.832))>30000:
        rejected.append({'name':p['name'],'reason':'hors périmètre ou coordonnées invalides'});return
    candidates=[by_source[p['sources'][0]['key']]] if p['sources'][0]['key'] in by_source else []
    if not candidates:
        candidates=[x for x in baseline+additions if x['category']==p['category'] and distance(x,p)<25 and (p['category']=='toilet' or norm(x['name'])==norm(p['name']))]
    if candidates:
        target=min(candidates,key=lambda x:distance(x,p));patch(target,{k:p[k] for k in ['organic','toilet_public','changing_table','wheelchair','free'] if k in p},p['sources']);matched.append({'name':p['name'],'id':target['id']});return
    additions.append(p)
    by_source[p['sources'][0]['key']]=p
# Municipal toilets: explicit public access; fees/accessibility only when documented.
for file in sorted((ROOT/'donnees/sources').glob('toilettes-publiques-de-la-commune-de-*.geojson')):
    slug=file.stem
    for f in read(str(file.relative_to(ROOT)))['features']:
        a=f['properties'];lon,lat=f['geometry']['coordinates'][:2];uid=a['uid']
        src=metadata_source(slug,'municipal-toilet:'+uid)
        # Same official UID can already have a source-specific prefix in the original catalog.
        prior=next((x for x in baseline+additions if any(s['key'].endswith(':'+uid) for s in x['sources'])),None)
        values=dict(toilet_public=True,wheelchair={'oui':True,'non':False}.get(a.get('acceshan')),free={'oui':False,'non':True}.get(a.get('payant')))
        if prior:patch(prior,values,[src]);matched.append({'name':a['nom'],'id':prior['id']});continue
        hours=a.get('horaires') or ''
        if hours.lower() in ['non','oui']:hours=''
        spec=a.get('openinghoursspecification') or []
        if isinstance(spec,str):
            try:spec=json.loads(spec)
            except ValueError:spec=[]
        days=dict(zip(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],['Mo','Tu','We','Th','Fr','Sa','Su']))
        parts=[]
        for h in spec:
            ds=h.get('dayOfWeek',[]);ds=[ds] if isinstance(ds,str) else ds
            if ds and all(d.split('/')[-1] in days for d in ds) and h.get('opens') and h.get('closes'):
                parts.append(','.join(days[d.split('/')[-1]] for d in ds)+' '+h['opens']+'-'+h['closes'])
        if parts:hours='; '.join(parts)
        add(place(src['key'],'Toilettes — '+a['nom'],'toilet',lon,lat,address=a.get('adresse') or '',city=a.get('commune') or '',access='public',toilets_available=True,hours=hours,description=' · '.join(filter(None,[a.get('infoloc'),a.get('commentaire')])),sources=[src],**values))
# Bio: exact 14-digit establishment identifier, never a fuzzy brand/name join.
bio={r['SIRET']:r for r in csv.DictReader((ROOT/'donnees/sources/operateurs-bio-017.csv').open(encoding='utf-8-sig'),delimiter=';') if re.fullmatch(r'\d{14}',r['SIRET']) and 'Distribution' in r['ACTIVITES'].split(',')}
bio_matches=[]
for e in read('donnees/sources/osm_lyon_30km.json')['elements']:
    t=e.get('tags',{});siret=t.get('ref:FR:SIRET','');key=f"osm:{e['type']}/{e['id']}";p=by_source.get(key)
    if p and p['category']=='food_shop' and siret in bio:
        b=bio[siret];src=source('agencebio:'+b['NUMERO BIO'],'Agence BIO · établissement distributeur','https://annuaire.agencebio.org/operateur/'+b['NUMERO BIO'])
        patch(p,{'organic':True},[src]);bio_matches.append({'id':p['id'],'siret':siret,'numero_bio':b['NUMERO BIO']})
# Library branch set confirmed by Lyon Junior; specialist/military archives excluded.
slug='bibliotheques-de-la-metropole-de-lyon-point-dinteret'
for f in read('donnees/sources/'+slug+'.geojson')['features']:
    a=f['properties'];url=a.get('sameas') or '';name=a['nom']
    if '/16-bibliotheques-et-un-bibliobus/' not in url and 'Ludothèque' not in name:continue
    src=metadata_source(slug,'metropole-library:'+a['identifiant']);lon,lat=f['geometry']['coordinates'][:2]
    refs=[src]
    if '/16-bibliotheques-et-un-bibliobus/' in url:refs.append(source('lyon-junior:'+a['identifiant'],'Ville de Lyon · accès des enfants aux bibliothèques','https://www.lyon.fr/sortir-et-decouvrir/se-cultiver-se-divertir/la-carte-culture-junior','Faits publics ; descriptif original'))
    add(place(src['key'],name,'child_activity',lon,lat,activity_type='Ludothèque' if 'Ludothèque' in name else 'Lecture en famille',description='Jeux et lecture en famille.' if 'Ludothèque' in name else 'Livres pour enfants et lecture en famille. Animations et inscriptions sur le site de la bibliothèque.',address=a.get('adresse') or '',city=a.get('address',{}).get('addressLocality') or '',hours=a.get('horaires') or '',website=url,sources=refs))
# Child/parent equipment explicitly named as such, not nurseries or generic youth centers.
slug='equipements-publics-de-la-metropole-de-lyon'
for f in read('donnees/sources/'+slug+'.geojson')['features']:
    a=f['properties'];kind=norm(a.get('type') or '');name=a.get('nom') or '';n=norm(name)
    if kind!='ludotheque' and 'accueil enfants parents' not in n:continue
    src=metadata_source(slug,'metropole-equipment:'+a['uid']);lon,lat=f['geometry']['coordinates'][:2]
    add(place(src['key'],name+(' — '+a['commune'] if name=='Ludothèque' else ''),'child_activity',lon,lat,activity_type='Ludothèque' if kind=='ludotheque' else 'Accueil enfants-parents',description='Espace de jeu en famille.' if kind=='ludotheque' else 'Accueil des petits avec leurs parents.',address=a.get('adresse') or '',city=a.get('commune') or '',website=a.get('web') or 'https://www.data.gouv.fr/datasets/'+slug,sources=[src]))
# Parks: municipal proof of playground + geometry to avoid duplicate existing playgrounds.
def in_ring(x,y,ring):
    inside=False
    for i in range(len(ring)):
        x1,y1=ring[i][:2];x2,y2=ring[i-1][:2]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1:inside=not inside
    return inside

def contains(g,p):
    polygons=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    return any(in_ring(p['lon'],p['lat'],poly[0]) and not any(in_ring(p['lon'],p['lat'],hole) for hole in poly[1:]) for poly in polygons)
slug='parcs-et-jardins-de-la-metropole-de-lyon-ponctuels'
polys={f['properties']['uid']:f['geometry'] for f in read('donnees/sources/parcs-et-jardins-de-la-metropole-de-lyon.geojson')['features']}
park_existing=[]
for f in read('donnees/sources/'+slug+'.geojson')['features']:
    a=f['properties'];equipment=norm(a.get('type_equip') or '')
    if not re.search(r'aires? de jeux|jeux pour enfants',equipment):continue
    lon,lat=f['geometry']['coordinates'][:2];key=a['identifiant'];geometry=polys.get(key)
    nearby=[x for x in baseline if x['category']=='playground' and ((geometry and contains(geometry,x)) or distance(x,dict(lat=lat,lon=lon))<75)]
    if nearby:
        park_existing.append({'park':key,'places':[p['id'] for p in nearby]});continue
    src=metadata_source(slug,'metropole-park:'+key)
    notes=['Jeux pour enfants signalés dans ce parc. Repère du parc, emplacement précis des jeux à repérer sur place.']
    if a.get('toilettes')=='oui':notes.append('Toilettes signalées dans le parc.')
    # "eau oui" does not prove potability; park fence does not prove playground enclosure.
    add(place(src['key'],'Jeux — '+a['nom'],'playground',lon,lat,address=a.get('adresse') or '',city=a.get('commune') or '',location_kind='park_reference',description=' '.join(notes),sources=[src]))
# Complementary OSM selection: explicit child clothing, baby goods, toys and indoor play.
osm_elements=read('donnees/sources/osm-familles-017.json')['elements']
osm_by_key={f"osm:{e['type']}/{e['id']}":e for e in osm_elements}
def osm_source(e):
    return source(f"osm:{e['type']}/{e['id']}",'OpenStreetMap',f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'ODbL 1.0')
def osm_place(e,category,**extra):
    t=e['tags'];pos=e.get('center') or e;src=osm_source(e)
    values=dict(address=' '.join(filter(None,[t.get('addr:housenumber'),t.get('addr:street')])),city=t.get('addr:city') or '',hours=t.get('opening_hours') or '',website=t.get('website') or t.get('contact:website') or src['url'],access=t.get('access') or 'unknown',wheelchair={'yes':True,'no':False}.get(t.get('wheelchair')),sources=[src])
    values.update(extra)
    return place(src['key'],t.get('name') or ('Pédiatre' if category=='health' else 'Magasin pour enfants'),category,pos['lon'],pos['lat'],**values)
for e in osm_elements:
    t=e['tags'];shop=t.get('shop');clothes=set(t.get('clothes','').split(';'))
    if t.get('access') in ['private','no'] or t.get('disused')=='yes':continue
    if shop=='baby_goods' or (shop=='clothes' and clothes&{'babies','children'}) or (shop=='toys' and not re.search(r'geek|modelisme|fuji|descartes',norm(t.get('name','')))):
        p=osm_place(e,'baby_shop',shop_type=shop,children_clothes=True if clothes&{'babies','children'} else None)
        p['description']='Vêtements pour bébés ou enfants.' if shop=='clothes' else ('Puériculture et articles pour bébé.' if shop=='baby_goods' else 'Magasin de jouets.')
        add(p)
    elif t.get('leisure')=='indoor_play' or t.get('amenity')=='toy_library':
        p=osm_place(e,'child_activity',activity_type='Jeux en intérieur' if t.get('leisure')=='indoor_play' else 'Ludothèque',description='Espace de jeux. Consulter le site pour les modalités de visite.')
        if t.get('min_age') and t.get('max_age'):p['age']=t['min_age']+'–'+t['max_age']+' ans'
        add(p)
    elif 'paediatrics' in t.get('healthcare:speciality','').split(';') and t.get('healthcare')=='doctor':
        p=osm_place(e,'health',health_type='doctor',pediatric=True)
        near=[x for x in baseline if x.get('health_type')=='doctor' and distance(x,p)<75]
        if near:matched.append({'name':p['name'],'id':min(near,key=lambda x:distance(x,p))['id']})
        else:add(p)
# Additional grocery stores only from general-food chains, with no invented baby stock.
for f in read('donnees/sources/magosm-magasins-017.geojson')['features']:
    t=f['properties'];shop=t.get('shop');name=t.get('name') or ''
    if shop not in ['supermarket','convenience'] or not re.search(r'\b(carrefour|casino|vival|spar|monop|monoprix|franprix|auchan|intermarche|u express|super u|lidl|aldi|coccinelle|coccimarket|proxy|proxi|netto|leclerc)\b',norm(name)):continue
    key=f"osm:{t['osm_type']}/{abs(int(t['osm_id']))}"
    if key in by_source:continue
    lon,lat=f['geometry']['coordinates'][:2]
    src=source(key,'OpenStreetMap via magOSM','https://www.openstreetmap.org/'+key[4:],'ODbL 1.0')
    add(place(key,name,'food_shop',lon,lat,shop_type=shop,address=' '.join(filter(None,[t.get('addr-housenumber'),t.get('addr-street')])),city=t.get('addr-city') or '',hours=t.get('opening_hours') or '',website=t.get('website') or t.get('contact-website') or src['url'],sources=[src]))
# Short original descriptions based on individually reviewed official pages.
geo=read('donnees/geocodage-familles-017.json')
for a in read('donnees/selection-familles-017.json'):
    features=geo.get(a['key'],[])
    if a['key']=='urgences-lyonsud':
        e=osm_by_key['osm:way/258500820'];p=osm_place(e,'health',health_type='emergency',pediatric=False,hours='24/7',age='Plus de 18 ans',location_kind='hospital_reference',description='Urgences adultes, bâtiment 3B. Repère du site hospitalier ; suivre la signalétique Urgences. Appeler le 15 avant de se déplacer.',website=a['url'])
        p['name']=a['name'];p['sources'].append(source('hcl:lyonsud','Hospices Civils de Lyon',a['url'],'Faits publics ; descriptif original'));add(p);continue
    if not features or features[0]['properties']['type']!='housenumber' or features[0]['properties']['score']<.9:
        rejected.append({'name':a['name'],'reason':'adresse exacte non géocodée'});continue
    g=features[0];lon,lat=g['geometry']['coordinates'][:2]
    props={k:v for k,v in a.items() if k not in ['key','name','category','address','url']}
    src=source('curated-family:'+a['key'],'Ville de Lyon' if a['url'].startswith('https://www.lyon.fr') else 'Hospices Civils de Lyon',a['url'],'Faits publics ; descriptif original')
    add(place(src['key'],a['name'],a.get('category','child_activity'),lon,lat,address=g['properties']['name'],city=g['properties']['city'],website=a['url'],location_kind='address',sources=[src,source('ban-family:'+a['key'],'Base Adresse Nationale / IGN','https://adresse.data.gouv.fr')],**props))
# Hospital services are reviewed against provider pages: an OSM emergency tag alone is insufficient.
for a in read('donnees/selection-sante-familles-017.json'):
    e=osm_by_key[a['osm']]
    p=osm_place(e,'health',health_type=a['health_type'],pediatric=a['pediatric'],hours=a['hours'],website=a['url'],location_kind='hospital_reference',description=a['description']+' Repère du site hospitalier ; suivre la signalétique du service.')
    service_key='hospital-service:'+a['key']
    p['id']='p_family017_'+hashlib.sha256(service_key.encode()).hexdigest()[:18];p['name']=a['name']
    p['sources'].insert(0,source(service_key,'Établissement de santé',a['url'],'Faits publics ; descriptif original'))
    add(p)
# Fold patches for places created in this same batch into their records.
for p in additions:
    if p['id'] in patches:
        extra=patches.pop(p['id']);p.update({k:v for k,v in extra.items() if k!='sources'});p['sources']=list({s['key']:s for s in p['sources']+extra['sources']}.values())
assert len({p['id'] for p in additions})==len(additions)
assert not {p['id'] for p in additions}&{p['id'] for p in baseline}
write('app/public/catalog-family-017.json',additions)
write('app/src/data-family-enrichment-017.json',patches)
report=dict(date=DATE,scope='30 km autour de Lyon',added=len(additions),categories=dict(Counter(p['category'] for p in additions)),patches=len(patches),bio_exact_siret=bio_matches,matched_existing=matched,parks_already_represented=park_existing,rejected=rejected)
(ROOT/'donnees/rapport-familles-017.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['added','categories','patches','rejected']},ensure_ascii=False));print('Bio exact SIRET',len(bio_matches),'Parcs déjà représentés',len(park_existing))
