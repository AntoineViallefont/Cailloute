"""Conserve les licences des dépendances distribuées avec l'application."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1];app=root/'app';lock=json.loads((app/'package-lock.json').read_text());out=[]
for name,info in sorted(lock['packages'].items()):
 if not name or info.get('dev'):continue
 folder=app/name
 try:package=json.loads((folder/'package.json').read_text())
 except FileNotFoundError:continue
 out.extend(['='*72,package.get('name',name)+' '+package.get('version',''),'Licence : '+str(package.get('license','Voir texte ci-dessous'))])
 files=[p for p in folder.iterdir() if p.is_file() and p.name.lower().startswith(('license','licence','copying','notice','ofl'))]
 for p in files:out.extend([p.name,p.read_text(errors='replace')])
for p in (app/'public/photo-privacy').glob('LICENSE*'):out.extend(['='*72,p.name,p.read_text(errors='replace')])
(app/'public/licences-composants.txt').write_text('\n\n'.join(out))
