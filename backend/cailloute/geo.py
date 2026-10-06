import math, unicodedata, re
CENTER = (45.7578, 4.832)
LABELS = {'playground': 'Aire de jeux', 'toilet': 'Toilettes', 'water': "Point d’eau", 'baby_shop': 'Magasin bébé', 'food_shop': 'Alimentation', 'transit': 'Arrêt de transport', 'changing_table': 'Table à langer'}
def distance(a, b):
    la, lo, lb, lob = map(math.radians, (*a, *b))
    h = math.sin((lb-la)/2)**2 + math.cos(la)*math.cos(lb)*math.sin((lob-lo)/2)**2
    return 6371008.8*2*math.asin(math.sqrt(min(1, h)))
def normalized(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', str(s or '')).encode('ascii','ignore').decode().lower())
def tri(v):
    if v is True or str(v).lower() in ('yes','oui','true','1'): return True
    if v is False or str(v).lower() in ('no','non','false','0'): return False
    return None
from .france import in_france
def in_scope(lat, lon): return in_france(lat, lon)

def can_merge(a, b, threshold=8):
    # Pas de fusion des quais ou d'équipements différents ; identité concordante obligatoire.
    if a['category'] != b['category'] or a['category'] == 'transit': return False
    if distance((a['lat'], a['lon']), (b['lat'], b['lon'])) > threshold: return False
    for k in ('wheelchair','changing_table','drinking_water','free'):
        if a.get(k) is not None and b.get(k) is not None and a[k] != b[k]: return False
    if a['category']=='water':
        if a.get('asset_ref') and a.get('asset_ref')==b.get('asset_ref'): return True
        if a.get('location_kind')=='point' and b.get('location_kind')=='point' and distance((a['lat'],a['lon']),(b['lat'],b['lon']))<=1: return True
    for k in ('name','address'):
        av, bv = normalized(a.get(k)), normalized(b.get(k))
        if av and av == bv and av not in {normalized(x) for x in LABELS.values()}: return True
    return False
