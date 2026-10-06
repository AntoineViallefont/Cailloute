"""Import explicite des lots nationaux dans le serveur, sans écraser les lieux existants."""
import json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from cailloute.db import Session,Place,SourceRecord,ExcludedPlace,init,emit
from cailloute.main import write_lock
init();count=0
with Session.begin() as s:
 write_lock(s);existing={p.id for p in s.query(Place)};excluded={p.id for p in s.query(ExcludedPlace)}
 for file in sorted((ROOT/'app/public/france').glob('*.json')):
  if file.name=='index.json':continue
  for d in json.loads(file.read_text()):
   if d['id'] in existing or d['id'] in excluded or any('source:'+hashlib.sha256(src['key'].encode()).hexdigest() in excluded for src in d['sources']):continue
   p=Place(id=d['id'],version=1,data=d,override={});s.add(p);emit(s,p);existing.add(p.id);count+=1
print(f'{count} lieux ajoutés ; lieux existants et exclusions conservés.')
