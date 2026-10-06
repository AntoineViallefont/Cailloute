"""Complément DATAtourisme : sorties familiales, sans contacts ni photos."""
import csv,json,math,uuid,re,sys,unicodedata
from pathlib import Path
from collections import Counter,defaultdict
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.france import in_france
D=ROOT/'donnees/france';OUT=ROOT/'app/public/france';src=json.loads((D/'datatourisme-source.json').read_text())
labels={'ZooAnimalPark':'Parc animalier','Zoo':'Zoo','Aquarium':'Aquarium','ThemePark':'Parc de loisirs','AmusementPark':'Parc d’attractions','PlayArea':'Aire de jeux','ToyLibrary':'Ludothèque','ChildrenClub':'Club enfants','ParkAndGarden':'Parc et jardin','Museum':'Musée','SwimmingPool':'Piscine','WaterPark':'Parc aquatique'}
def norm(s):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',s.lower()).encode('ascii','ignore').decode())
index=json.loads((OUT/'index.json').read_text());tiles={};cells=defaultdict(list)
for t in index['tiles']:
 rows=json.loads((OUT/t['file']).read_text());tiles[t['file']]=rows
 for p in rows:cells[(int(p['lat']*1000),int(p['lon']*1000))].append(p)
counts=Counter();excluded=Counter()
with (D/'datatourisme-place.csv').open() as f:
 for row in csv.DictReader(f):
  types={t.split('#')[-1] for t in row['Categories_de_POI'].split('|')};kind=next((k for k in labels if k in types),None)
  if not kind:continue
  try:lat=float(row['Latitude']);lon=float(row['Longitude'])
  except ValueError:excluded['sans_coordonnees']+=1;continue
  if not in_france(lat,lon):excluded['hors_perimetre']+=1;continue
  name=row['Nom_du_POI'];x,y=int(lat*1000),int(lon*1000)
  if any(norm(p['name'])==norm(name) and abs(p['lat']-lat)<.0005 and abs(p['lon']-lon)<.0007 for a in range(x-1,x+2) for b in range(y-1,y+2) for p in cells[(a,b)]):excluded['rapprochement_meme_nom']+=1;continue
  key=row['URI_ID_du_POI'];ident='dt_'+uuid.uuid5(uuid.NAMESPACE_URL,key).hex
  category='playground' if kind=='PlayArea' else 'child_activity'
  p={'id':ident,'version':1,'name':name,'category':category,'lat':lat,'lon':lon,'address':row['Adresse_postale'].replace('#',', ') if row['Adresse_postale']!='-' else '', 'city':row['Code_postal_et_commune'].replace('#',' '),'hours':'','description':'Vérifiez auprès du lieu les âges, horaires et conditions d’accès.','age':'','access':'unknown','activity_type':labels[kind],'wheelchair':None,'changing_table':None,'drinking_water':None,'free':None,'fenced':None,'elevator':None,'sources':[{'key':key,'name':'DATAtourisme · '+row['Createur_de_la_donnee'],'url':key,'license':'Licence Ouverte 2.0','retrieved_at':src['date'],'updated_at':row['Date_de_mise_a_jour']}],'rating':None,'review_count':0,'photo_count':0,'license_verified':True,'location_kind':'point'}
  tile=f'{math.floor(lat)}_{math.floor(lon)}.json';tiles.setdefault(tile,[]).append(p);cells[(x,y)].append(p);counts[kind]+=1
for name,rows in tiles.items():(OUT/name).write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
index['tiles']=[{'file':name,'bounds':[int(name[:-5].split('_')[1]),int(name[:-5].split('_')[0]),int(name[:-5].split('_')[1])+1,int(name[:-5].split('_')[0])+1],'count':len(rows)} for name,rows in sorted(tiles.items())];index['total']=sum(t['count'] for t in index['tiles']);(OUT/'index.json').write_text(json.dumps(index,separators=(',',':')))
report={'added':sum(counts.values()),'types':dict(counts),'excluded':dict(excluded),'source':src,'catalog_total':index['total']};(D/'rapport-tourisme.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
