"""Import reproductible, provenance et rapprochement conservateur (8 m)."""
import argparse, hashlib, json, uuid
from collections import Counter, defaultdict
from pathlib import Path
import httpx
from .db import ROOT, Session, Place, ExcludedPlace, SourceRecord, Audit, Review, Photo, Favorite, Cache, engine, now, init, emit
from sqlalchemy import text
from .geo import LABELS, tri, in_scope, can_merge, distance

FILES = {'toilettes_lyon': 'toilet', 'toilettes_metropole': 'toilet', 'bornes_fontaines_metropole': 'water', 'eau_potable_metropole': 'water', 'jeux_caluire': 'playground', 'jeux_rillieux': 'playground', 'arrets_tcl': 'transit'}

def tcl_modes(lines):
    modes=set()
    for line in lines:
        if line in ('A','B','C','D'): modes.add('metro')
        elif line in ('T1','T2','T3','T4','T5','T6','T7','RX'): modes.add('tram')
        elif line and line not in ('F1','F2','NAVI1'): modes.add('bus')
    return [mode for mode in ('metro','tram','bus') if mode in modes]

def osm_modes(tags):
    if tags.get('railway') == 'subway_entrance' or tags.get('station') == 'subway' or tags.get('subway') == 'yes': return ['metro']
    if tags.get('railway') == 'tram_stop' or tags.get('tram') == 'yes': return ['tram']
    if tags.get('highway') == 'bus_stop' or tags.get('bus') == 'yes': return ['bus']
    return []

def feature_record(name, f, manifest):
    props = f.get('properties') or {}; geom = f.get('geometry') or {}
    if geom.get('type') != 'Point': return None
    lon, lat = geom['coordinates'][:2]
    if not in_scope(lat, lon): return None
    cat = FILES[name]
    # Les identifiants métier priment sur les identifiants techniques de publication.
    source_id = next((props[k] for k in ('uid','id','identifiant','identifiantbornefontaine','identifiant_interne','gid') if props.get(k) is not None), f.get('id'))
    key = f'{name}:{source_id}'
    d = {'name': props.get('nom') or LABELS[cat], 'category': cat, 'lat': lat, 'lon': lon,
         'address': props.get('adresse') or props.get('localisation') or '', 'city': props.get('commune') or '',
         'wheelchair': tri(props.get('pmr', props.get('jeux_pmr'))), 'changing_table': None,
         'drinking_water': True if name == 'eau_potable_metropole' else None,
         'free': None, 'access': 'public' if props.get('ouvert_public') is True or cat == 'toilet' else ('private' if props.get('ouvert_public') is False else 'unknown'),
         'elevator': tri(props.get('ascenseur')), 'fenced': tri(props.get('espace_clos')),
         'age': str(props.get('tranche_age') or ''), 'hours': '', 'description': str(props.get('infoloc') or props.get('remarque') or ''),
         'asset_ref':str(props.get('identifiant') or props.get('identifiantbornefontaine') or '') if cat=='water' else '',
         'location_kind': 'point', 'source_updated': props.get('datemaj') or props.get('last_update')}
    lines=sorted(set(x.split(':')[0] for x in str(props.get('desserte') or '').split(',') if x)) if cat=='transit' else []
    d.update(transit_modes=tcl_modes(lines),transit_lines=lines,toilets_available=True if cat=='toilet' else None)
    return key, d, {'key': key, 'name': name, 'url': manifest['url'], 'license': manifest['license'], 'retrieved_at': manifest['retrieved_at'], 'raw': props}

def osm_record(e, manifest):
    t = e.get('tags', {}); pos = e if 'lat' in e else e.get('center', {})
    if 'lat' not in pos or not in_scope(pos['lat'],pos['lon']): return None
    cat = 'playground' if t.get('leisure') == 'playground' else 'toilet' if t.get('amenity') == 'toilets' else 'water' if t.get('amenity') == 'drinking_water' else 'baby_shop' if t.get('shop') == 'baby_goods' else 'food_shop' if t.get('shop') in ('supermarket','convenience','chemist') else 'transit' if t.get('railway') in ('station','halt','subway_entrance','tram_stop') else 'changing_table' if tri(t.get('changing_table')) is True else None
    if not cat: return None
    key = f"osm:{e['type']}/{e['id']}"
    d = {'name': t.get('name') or t.get('brand') or LABELS[cat], 'category': cat, 'lat': pos['lat'], 'lon': pos['lon'],
         'address': ' '.join(filter(None,[t.get('addr:housenumber'),t.get('addr:street')])), 'city':t.get('addr:city',''),
         'wheelchair':tri(t.get('wheelchair')), 'changing_table':tri(t.get('changing_table')), 'drinking_water':tri(t.get('drinking_water')) if 'drinking_water' in t else (True if cat == 'water' else None),
         'free': not tri(t['fee']) if tri(t.get('fee')) is not None else None,
         'access':t.get('access','unknown'), 'hours':t.get('opening_hours',''), 'age': '–'.join(filter(None,[t.get('min_age'), t.get('max_age')])),
         'elevator': None, 'fenced': tri(t.get('fenced')), 'description':t.get('description',''), 'location_kind': 'point' if e['type']=='node' else 'approximate_center',
         'source_updated':None}
    d.update(transit_modes=osm_modes(t) if cat=='transit' else [],transit_lines=[],toilets_available=True if cat=='toilet' else None)
    if cat=='changing_table': d['category']='toilet'
    return key,d,{'key':key,'name':'OpenStreetMap','url':f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'license':'ODbL 1.0','retrieved_at':manifest['retrieved_at'],'raw':t}

def refresh():
    folder = ROOT/'donnees/sources'
    manifests = json.loads((folder/'manifest_grandlyon.json').read_text())
    staged={}
    with httpx.Client(timeout=120, follow_redirects=True, headers={'User-Agent':'Cailloute/0.1 (import donnees publiques)'}) as client:
        for m in manifests:
            features=[]; url=m['url']; seen=set()
            while url:
                if url in seen: raise RuntimeError('Boucle de pagination')
                seen.add(url); r=client.get(url); r.raise_for_status(); payload=r.json()
                features.extend(payload['features'])
                url=next((x['href'] for x in payload.get('links',[]) if x.get('rel')=='next'),None)
            if not features: raise RuntimeError(f"Source vide : {m['name']}, ancien fichier conservé")
            payload['features']=features
            if isinstance(payload.get('numberMatched'),int) and payload['numberMatched'] != len(features): raise RuntimeError('Téléchargement incomplet')
            raw=json.dumps(payload,ensure_ascii=False).encode()
            path=folder/Path(m['file']).name; staged[path]=raw
            m.update(count=len(features),sha256=hashlib.sha256(raw).hexdigest(),retrieved_at=now(),numberMatched=len(features))
        staged[folder/'manifest_grandlyon.json']=json.dumps(manifests,ensure_ascii=False,indent=2).encode()
        query=(folder/'requete_osm.overpassql').read_text()
        r=client.post('https://overpass-api.de/api/interpreter',data={'data':query}); r.raise_for_status(); payload=r.json()
        if payload.get('remark') or not payload.get('elements'): raise RuntimeError('Réponse OSM incomplète, ancien fichier conservé')
        raw=r.content; path=folder/'osm_lyon_30km.json'; staged[path]=raw
        m=json.loads((folder/'manifest_osm.json').read_text()); m.update(retrieved_at=now(),count=len(payload['elements']),sha256=hashlib.sha256(raw).hexdigest())
        staged[folder/'manifest_osm.json']=json.dumps(m,ensure_ascii=False,indent=2).encode()
        # Aucune source conservée n'est remplacée tant qu'un téléchargement a échoué.
        for path,raw in staged.items():
            temp=path.with_suffix('.tmp');temp.write_bytes(raw);temp.replace(path)

def run():
    init(); folder=ROOT/'donnees/sources'; incoming=[]; counts=Counter()
    manifests=json.loads((folder/'manifest_grandlyon.json').read_text())
    for m in manifests:
        raw=(folder/Path(m['file']).name).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=m['sha256']: raise RuntimeError(f"Empreinte invalide : {m['name']}")
        for f in json.loads(raw)['features']:
            r=feature_record(m['name'],f,m)
            if r: incoming.append(r); counts[m['name']]+=1
    m=json.loads((folder/'manifest_osm.json').read_text()); raw=(folder/'osm_lyon_30km.json').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=m['sha256']: raise RuntimeError('Empreinte OSM invalide')
    for e in json.loads(raw)['elements']:
        r=osm_record(e,m)
        if r: incoming.append(r); counts['osm']+=1
    merged=0; created=0; updated=0; candidates=[]
    with Session.begin() as s:
        s.execute(text('SELECT pg_advisory_xact_lock(76231001)' if engine.dialect.name=='postgresql' else 'BEGIN IMMEDIATE'))
        records={r.key:r for r in s.query(SourceRecord)}; places={p.id:p for p in s.query(Place)}
        cells=defaultdict(list)
        def cell(d): return int(d['lat']*10000),int(d['lon']*10000)
        for p in places.values(): cells[cell(p.data)].append(p)
        touched=set(); received=set()
        excluded={p.id for p in s.query(ExcludedPlace)}
        for key,d,source in incoming:
            if 'p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex in excluded or 'source:'+hashlib.sha256(key.encode()).hexdigest() in excluded:continue
            received.add(key)
            if key in records:
                record=records[key]; record.data={'place':d,'source':source,'active':True}; touched.add(record.place_id); continue
            x,y=cell(d); options=[]
            for i in range(x-3,x+4):
                for j in range(y-3,y+4): options.extend(cells[(i,j)])
            matches=[p for p in options if not p.data.get('redirect') and can_merge(d,p.data)]
            # Un seul candidat, jamais fusion entre deux objets du même fournisseur.
            matches=[p for p in matches if not any(r.place_id==p.id and r.key.split(':')[0]==key.split(':')[0] for r in records.values())]
            if len(matches)==1:
                p=matches[0]; merged+=1
                s.add(Audit(user_id='import',place_id=p.id,kind='source.merge',created=now(),data={'source_key':key,'threshold_m':8}))
            else:
                ident='p_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex
                p=Place(id=ident,data={**d,'sources':[]},override={},version=1); s.add(p); places[ident]=p; cells[cell(d)].append(p); created+=1
                for other in options:
                    if other.data['category']==d['category'] and d['category']!='transit':
                        dist=distance((d['lat'],d['lon']),(other.data['lat'],other.data['lon']))
                        if dist<=20: candidates.append({'a':p.id,'b':other.id,'distance_m':round(dist,2)})
            record=SourceRecord(key=key,place_id=p.id,data={'place':d,'source':source,'active':True}); s.add(record); records[key]=record; touched.add(p.id)
        for key,r in records.items():
            if key not in received and r.data.get('active',True):
                r.data={**r.data,'active':False}; touched.add(r.place_id)
        by_place=defaultdict(list)
        for r in records.values(): by_place[r.place_id].append(r)
        for ident in touched:
            p=places[ident]; rr=[r for r in by_place[ident] if r.data.get('active')]
            if p.data.get('redirect'): continue
            if not rr:
                d={**p.data,'withdrawn':True}
            else:
                d=dict(rr[0].data['place'])
                for r in rr[1:]:
                    for k,v in r.data['place'].items():
                        if (d.get(k) is None or d.get(k)=='' or d.get(k)=='unknown') and v is not None: d[k]=v
                sources=[{k:v for k,v in r.data['source'].items() if k!='raw'} for r in rr]
                d.update(sources=sources,license_verified=all(x['license'] in ('ODbL 1.0','Licence Ouverte 2.0') for x in sources),withdrawn=False,
                         rating=p.data.get('rating'),review_count=p.data.get('review_count',0))
            if p.data!=d:
                p.data=d; p.version=(p.version or 0)+1; emit(s,p); updated+=1
        # Réconcilier aussi les anciens imports quand une concordance devient disponible.
        for p in sorted(places.values(),key=lambda p:p.id):
            if p.data.get('redirect') or p.data['category']!='water' or p.override: continue
            if s.query(Review).filter_by(place_id=p.id).first() or s.query(Photo).filter_by(place_id=p.id).first(): continue
            x,y=cell(p.data); options=[]
            for i in range(x-2,x+3):
                for j in range(y-2,y+3):
                    for other in cells[(i,j)]:
                        if other.id>=p.id or other.data.get('redirect') or other.override or not can_merge(p.data,other.data): continue
                        source_a={r.key.split(':')[0] for r in by_place[p.id]};source_b={r.key.split(':')[0] for r in by_place[other.id]}
                        if source_a & source_b: continue
                        # Toutes les coordonnées d'origine doivent rester dans le seuil : aucune chaîne.
                        if any(distance((a.data['place']['lat'],a.data['place']['lon']),(b.data['place']['lat'],b.data['place']['lon']))>8 for a in by_place[p.id] for b in by_place[other.id]): continue
                        options.append(other)
            if len(options)!=1: continue
            target=options[0]
            s.add(Audit(user_id='import',place_id=target.id,kind='place.merge',created=now(),data={'from':p.id,'before_source':p.data,'before_target':target.data,'source_keys':[r.key for r in by_place[p.id]]}))
            for r in by_place[p.id]: r.place_id=target.id
            by_place[target.id].extend(by_place[p.id]); by_place[p.id]=[]
            data=dict(target.data)
            for k,v in p.data.items():
                if data.get(k) is None or data.get(k)=='' or data.get(k)=='unknown':data[k]=v
            data['sources']=target.data['sources']+p.data['sources'];data['license_verified']=all(x['license'] in ('ODbL 1.0','Licence Ouverte 2.0') for x in data['sources'])
            target.data=data;target.version+=1;emit(s,target)
            p.data={**p.data,'redirect':target.id};p.version+=1;emit(s,p);merged+=1
        total=sum(not p.data.get('redirect') for p in places.values()); unique_categories=Counter(p.data['category'] for p in places.values() if not p.data.get('withdrawn') and not p.data.get('redirect'))
    report={'imported_at':now(),'source_records_in_scope':dict(counts),'source_records':sum(counts.values()),'unique_places':total,'created':created,'updated':updated,'automatic_merges':merged,'categories':dict(unique_categories),'threshold_m':8,'manual_candidates':len(candidates),'private_app_data_imported':False}
    (ROOT/'donnees/rapport_import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    if candidates: (ROOT/'donnees/rapprochements_a_verifier.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2))
    elif (ROOT/'donnees/rapprochements_a_verifier.json').exists():
        report['manual_candidates']=len(json.loads((ROOT/'donnees/rapprochements_a_verifier.json').read_text()))
        (ROOT/'donnees/rapport_import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    with Session.begin() as s:s.merge(Cache(key='import-report',data=report,expires=0))
    print(json.dumps(report,ensure_ascii=False,indent=2)); return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--refresh',action='store_true'); args=parser.parse_args()
    if args.refresh: refresh()
    run()
