"""Complément ponctuel 0.1.7. Ne modifie jamais le catalogue initial."""
from pathlib import Path
import json, math, collections
ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-09-15'
def distance(lat, lon):
    r = math.pi / 180
    h = math.sin((lat-45.7578)*r/2)**2 + math.cos(lat*r)*math.cos(45.7578*r)*math.sin((lon-4.832)*r/2)**2
    return 12742017.6*math.asin(min(1, math.sqrt(h)))
def place(ident, name, lat, lon, **data):
    return dict(id=ident, version=1, name=name, lat=lat, lon=lon, category='health', address='', city='', hours='', description='', age='', access='unknown', wheelchair=None, changing_table=None, drinking_water=None, free=None, fenced=None, elevator=None, rating=None, review_count=0, license_verified=True, information_validated=False, **data)
def link(key, name, url, license='Faits publics ; descriptif original'):
    return dict(key=key, name=name, url=url, license=license, retrieved_at=DATE)
rows = []
for f in json.loads((ROOT/'donnees/health-pharmacy-017.json').read_text())['features']:
    lon,lat = f['geometry']['coordinates']; t=f['properties']
    if distance(lat,lon)>30000: continue
    key=f"osm:{t['osm_type']}/{t['osm_id']}"
    p=place('p_017_'+key.replace(':','_').replace('/','_'),t.get('name') or 'Pharmacie',lat,lon)
    p.update(health_type='pharmacy',address=' '.join(filter(None,[t.get('addr-housenumber'),t.get('addr-street')])),city=t.get('addr-city') or '',hours=t.get('opening_hours') or '',website=t.get('website') or t.get('contact-website') or '',wheelchair={'yes':True,'no':False}.get(t.get('wheelchair')),sources=[link(key,'OpenStreetMap via magOSM',f"https://www.openstreetmap.org/{t['osm_type']}/{t['osm_id']}",'ODbL 1.0')])
    rows.append(p)
geo=json.loads((ROOT/'donnees/geocodage-017.json').read_text())
curated=[
 ('hfme','Urgences pédiatriques — Hôpital Femme Mère Enfant','health','emergency','', 'Accueil des urgences pédiatriques. Appeler le 15 avant de se déplacer. Position de l’entrée du site hospitalier ; suivre la signalétique Urgences pédiatriques.','https://www.chu-lyon.fr/urgences'),
 ('sos','SOS Médecins Lyon — Consultations','health','doctor','','Consultations de médecine générale sur rendez-vous au centre de Lyon 7e. Rendez-vous sur le site de SOS Médecins.','https://sos-medecin-lyon.fr/actualite/le-centre-de-consultation-de-sos-medecins-lyon-demenage/'),
 ('confluence','MJC Confluence — Bébé gym et théâtre','child_activity','Bébé gym · Théâtre','Bébé gym : 18 mois–3 ans ; théâtre sur place : 8–12 ans','Bébé gym avec un adulte et ateliers de théâtre pour enfants. Programme 2026–2027 et inscriptions auprès de la MJC.','https://www.mjc-confluence.fr/loisirs/'),
 ('stjust','MJC Saint-Just — Théâtre enfants','child_activity','Théâtre','8–16 ans','Ateliers de théâtre pour enfants et adolescents : jeu, voix et création d’un spectacle. Programme 2026–2027 et inscriptions sur le site.','https://mjcstjust.org/theatre/'),
 ('rancy','Les Rancy — Activités enfants','child_activity','Éveil · Théâtre','','Activités artistiques et sportives pour enfants et adolescents. Consulter la programmation 2026–2027 pour les âges et les inscriptions.','https://www.salledesrancy.com/'),
 ('vaise','Piscine de Vaise — Bébés nageurs','child_activity','Bébés nageurs','','Découverte de l’eau pour les tout-petits accompagnés. Consulter les créneaux et les modalités auprès de la piscine.','https://mairie2.lyon.fr/parcours-de-lenfance/les-familles-du-2/les-acteurs-de-la-petite-enfance-pour-vous-accompagner'),
 ('eaudesoie','L’Eau de Soie — Bébés dans l’eau','child_activity','Bébés nageurs','4 mois–4 ans','Séances d’éveil aquatique pour bébé avec ses parents, sur réservation. Informations et réservation sur le site du centre.','https://www.eau-de-soie.fr/beacutebeacutes-nageurs-lyon.html'),
]
for ident,name,category,kind,age,description,url in curated:
    g=geo[ident]; props=g['properties']; lon,lat=g['geometry']['coordinates']
    assert props['score']>.9 and distance(lat,lon)<30000
    p=place('p_017_'+ident,name,lat,lon)
    p.update(category=category,age=age,description=description,website=url,address=props['name'],city=props['city'],location_kind='address',sources=[link('curated:'+ident,'Organisateur' if category=='child_activity' else 'Établissement de santé',url),link('ban:'+ident,'Base Adresse Nationale / IGN','https://adresse.data.gouv.fr','Licence Ouverte 2.0')])
    p['health_type' if category=='health' else 'activity_type']=kind
    rows.append(p)
g=geo['primark']; lon,lat=g['geometry']['coordinates']
p=place('p_017_primark','Primark Lyon Part-Dieu',lat,lon)
p.update(category='baby_shop',children_clothes=True,address='17 rue du Docteur Bouchut · Westfield La Part-Dieu',city='Lyon',description='Vêtements pour bébés et enfants. Boutique dans le centre commercial de la Part-Dieu.',website='https://www.primark.com/fr-fr/stores/lyon/centre-commercial-part-dieu',sources=[link('curated:primark','Primark Lyon','https://www.primark.com/fr-fr/stores/lyon/centre-commercial-part-dieu'),link('curated:primark-westfield','Westfield La Part-Dieu','https://www.westfield.com/fr/france/lapartdieu/boutiques/primark/63952'),link('ban:primark','Base Adresse Nationale / IGN','https://adresse.data.gouv.fr','Licence Ouverte 2.0')])
rows.append(p)
assert len(set(p['id'] for p in rows))==len(rows)
(ROOT/'app/public/catalog-017.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
report=dict(date=DATE,count=len(rows),categories=dict(collections.Counter(p['category'] for p in rows)),health_types=dict(collections.Counter(p.get('health_type') for p in rows if p['category']=='health')),scope='30 km autour de Lyon',pharmacy_dataset='https://www.data.gouv.fr/datasets/localisation-des-pharmacies-dans-openstreetmap',curated_sources=[dict(name=r[1],url=r[-1]) for r in curated],notes=['Import ponctuel, sans écrasement du catalogue initial ni des contributions.','Pharmacies OSM : présence géographique ; garde et disponibilité non déduites.','Activités : descriptifs originaux brefs, pas de copie de programmes ou tarifs.','Localisation des entrées par BAN ; dates de validation utilisateur laissées vides.'])
(ROOT/'donnees/rapport-complement-017.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['count','categories','health_types']},ensure_ascii=False))
