"""Récupère les descriptions culturelles complètes depuis les fichiers locaux."""
import csv
import json
import sys
from pathlib import Path

csv.field_size_limit(20_000_000)
root = Path(__file__).resolve().parents[1]
patches = json.loads((root / 'app/src/data-open-enrichment.json').read_text())
needed = {}
for ident, row in patches.items():
    text = row.get('patch', {}).get('description', '')
    if isinstance(text, str) and text.startswith('["'):
        for source in row.get('sources', []):
            if source.get('key', '').startswith('culture:'):
                needed.setdefault(source['key'][8:], []).append(ident)
output = Path(sys.argv[1])
result = json.loads(output.read_text()) if output.exists() else {}
with (root / 'donnees/france/lieux-culturels-039.csv').open(encoding='utf-8-sig', newline='') as stream:
    for row in csv.DictReader(stream, delimiter=';'):
        for ident in needed.get(row['id'], []):
            result[ident] = row.get('description', '')
Path(sys.argv[1]).write_text(json.dumps(result, ensure_ascii=False))
print(f'{len(result)} descriptions complètes retrouvées dans les sources culturelles locales.')
