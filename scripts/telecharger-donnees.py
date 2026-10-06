"""Installe uniquement les données publiques de la version, après contrôle SHA-256."""
from pathlib import Path
import hashlib
import json
import shutil
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'donnees/manifest-public.json').read_text())
marker = ROOT / 'app/public/france/.version-publique'
if marker.exists() and marker.read_text().strip() == manifest['sha256'] and all((ROOT / p).exists() for p in manifest['paths']):
    print('Les données de cette version sont déjà présentes.')
else:
    with tempfile.TemporaryDirectory(prefix='cailloute-donnees-') as work:
        archive = Path(work) / 'donnees.tar.gz'
        print('Téléchargement des données ouvertes de Cailloute…')
        urllib.request.urlretrieve(manifest['url'], archive)
        digest = hashlib.sha256()
        with archive.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != manifest['sha256']:
            raise SystemExit('Empreinte incorrecte : extraction refusée.')
        extracted = Path(work) / 'extracted'
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                name = Path(member.name)
                if name.is_absolute() or '..' in name.parts or member.issym() or member.islnk():
                    raise SystemExit('Chemin d’archive refusé.')
                if member.name != 'LICENCES-DONNEES.md' and not any(member.name == p or member.name.startswith(p + '/') for p in manifest['paths']):
                    raise SystemExit('Contenu d’archive inattendu.')
            tar.extractall(extracted, filter='data')
        # Installation non destructive : les éventuels fichiers locaux supplémentaires restent présents.
        for name in manifest['paths']:
            src, dst = extracted / name, ROOT / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.is_dir():
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        marker.write_text(manifest['sha256'] + '\n')
        print('Données vérifiées et installées.')
