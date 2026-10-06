"""Import ponctuel des tracés TCL sous Licence Ouverte 2.0, sans modifier les lieux."""
import json
import math
from datetime import date
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
TODAY = date.today().strftime('%Y%m%d')
def simplify(points, tolerance=3):
    # Douglas-Peucker en mètres : conserve les virages sans embarquer chaque sommet.
    xy = [(lon * 77600, lat * 111200) for lat, lon in points]
    keep = {0, len(points)-1}
    stack = [(0, len(points)-1)]
    while stack:
        start, end = stack.pop()
        ax, ay = xy[start]; bx, by = xy[end]
        dx, dy = bx-ax, by-ay; length = dx*dx+dy*dy
        maximum, index = 0, start
        for i in range(start+1, end):
            x, y = xy[i]
            t = max(0, min(1, ((x-ax)*dx+(y-ay)*dy)/length)) if length else 0
            distance = (x-ax-t*dx)**2+(y-ay-t*dy)**2
            if distance > maximum: maximum, index = distance, i
        if maximum > tolerance*tolerance:
            keep.add(index); stack.extend([(start,index),(index,end)])
    return [points[i] for i in sorted(keep)]

routes = []
sources = []
for mode, slug in [('bus', 'bus'), ('metro', 'metro-et-funiculaire'), ('tram', 'tramway')]:
    catalog = f'https://www.data.gouv.fr/api/1/datasets/lignes-de-{slug}-du-reseau-transports-en-commun-lyonnais/'
    with urlopen(catalog, timeout=45) as response:
        metadata = json.load(response)
    assert metadata['license'] == 'lov2'
    url = next(r['url'] for r in metadata['resources'] if 'application/json' in r['url'])
    with urlopen(url, timeout=60) as response:
        features = json.load(response)['features']
    sources.append({'mode': mode, 'url': url, 'license': 'Licence Ouverte 2.0'})
    groups = {}
    for feature in features:
        p = feature['properties']
        if p.get('date_debut') and p['date_debut'] > TODAY:
            continue
        if p.get('date_fin') and p['date_fin'] < TODAY:
            continue
        # Tracés réguliers : pas de cumul des déviations temporaires avec le parcours normal.
        if p.get('type_trace') == 'TVX':
            continue
        lines = feature['geometry']['coordinates']
        if not any(math.hypot((lon - 4.832) * 77600, (lat - 45.7578) * 111200) < 32000
                   for line in lines for lon, lat, *_ in line):
            continue
        number = p['ligne'].strip().upper()
        key = mode + ':' + number
        route = groups.setdefault(key, {'id': key, 'mode': mode, 'line': number,
            'color': p.get('couleur_hex') or '#586170', 'paths': [], 'destinations': []})
        for name in [p.get('nom_origine'), p.get('nom_destination')]:
            if name and name not in route['destinations']:
                route['destinations'].append(name)
        for line in lines:
            points = simplify([[round(lat, 5), round(lon, 5)] for lon, lat, *_ in line])
            if len(points) > 1 and points not in route['paths']:
                route['paths'].append(points)
    routes.extend(groups.values())
result = {'date': date.today().isoformat(), 'sources': sources, 'routes': routes}
output = ROOT / 'app/public/transit-routes.json'
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
print(f'{len(routes)} lignes — {output.stat().st_size:,} octets')
