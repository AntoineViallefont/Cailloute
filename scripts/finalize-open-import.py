"""Applique les informations demandées localement et prépare les photos à valider."""
import json,importlib.util,hashlib,math
from collections import defaultdict
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[1];folder=root/'donnees/enrichissement-ouvert'
spec=importlib.util.spec_from_file_location('apply_open',root/'scripts/apply-open-enrichment.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
report=json.loads((folder/'candidates.json').read_text());today=datetime.now(timezone.utc).isoformat()
# Antoine a demandé l'import de toutes les informations trouvées, sans bouton Gemini.
facts={'schema':1,'approved':True,'approvedAt':today,'authorization':'Demande utilisateur du 03/10/2026 : importer sur la totalité de la zone couverte','candidates':[{k:c[k] for k in ('place','patch','expected','baseVersion','sources')} for c in report['candidates'] if c['patch']]}
patches=module.build_approved(facts,module.catalog.catalog_places(root))
target=root/'app/src/data-open-enrichment.json';previous=json.loads(target.read_text());previous.update(patches);target.write_text(json.dumps(previous,ensure_ascii=False,separators=(',',':'))+'\n')
# Séparation géographique : aucun gros dictionnaire national à lire au démarrage.
regional=defaultdict(dict)
places=module.catalog.catalog_places(root)
for ident,patch in previous.items():
 place=places.get(ident)
 if place:regional[f"{math.floor(place['lat'])}_{math.floor(place['lon'])}"][ident]=patch
assets=root/'app/public/enrichment';assets.mkdir(exist_ok=True)
for key,rows in regional.items():(assets/f'{key}.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
(assets/'index.json').write_text(json.dumps({'schema':1,'version':hashlib.sha256(target.read_bytes()).hexdigest()[:16],'tiles':sorted(regional)},separators=(',',':'))+'\n')
photos=[]
for row in report['candidates']:
 photo=row.get('photo')
 if not photo or not photo.get('detectionComplete') or not photo.get('finalFile') or photo.get('status')=='excluded':continue
 data=(folder/photo['finalFile']).read_bytes()
 if len(data)>40000 or data[:4]!=b'RIFF' or data[8:12]!=b'WEBP' or hashlib.sha256(data).hexdigest()!=photo['finalSha256']:raise ValueError('Copie photo invalide')
 import base64
 photos.append({'place':row['place'],'patch':row['patch'],'photo':{'url':'data:image/webp;base64,'+base64.b64encode(data).decode(),'caption':photo['caption'],'sourceUrl':photo['sourceUrl'],'license':photo['license'],'author':photo['author'],'privacyReviewed':True}})
# Ce manifeste ne permet aucune publication tant que le premier lot n'est pas validé.
photo_plan={'schema':1,'approved':False,'validationRequired':True,'created':today,'scope':report['scope'],'candidates':photos}
(folder/'photos-a-valider.json').write_text(json.dumps(photo_plan,ensure_ascii=False,separators=(',',':'))+'\n')
summary={'date':today,'scope':report['scope'],'placesScanned':report['placesScanned'],'placesEnriched':len(patches),'fieldsImported':sum(len(p['patch']) for p in patches.values()),'photosReady':len(photos),'photoBytes':sum(len(base64.b64decode(p['photo']['url'].split(',')[1])) for p in photos),'maxPhotoBytes':max([len(base64.b64decode(p['photo']['url'].split(',')[1])) for p in photos],default=0),'localOverlayBytes':target.stat().st_size,'regionalEnrichmentFiles':len(regional),'firebaseWrites':0,'billingEnabled':False,'geminiButton':False,'deployed':False,'distributed':False,'publicationAwaitingValidation':True,'photosGeographicCoverage':sorted(set(p['place'].get('city','') for p in photos))}
(root/'livraison/ENRICHISSEMENT-A-VALIDER.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='photosGeographicCoverage'},ensure_ascii=False))

# Préparation éditoriale locale après import : textes lisibles, sources brutes conservées.
import subprocess
subprocess.run(["node", str(root / "app/scripts/clean-place-data.mjs")], check=True)

# Réappliquer les rapprochements vérifiés aux nouvelles sources, sans toucher aux contributions.
subprocess.run(["node", "scripts/build-place-groups.mjs"], cwd=root / "app", check=True)
