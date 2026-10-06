"""Périmètre métropole + Corse, contours IGN/Etalab simplifiés à 100 m."""
import json,math
from pathlib import Path
from functools import lru_cache
@lru_cache
def polygons():
    path=Path(__file__).resolve().parents[2]/'app/src/france-boundaries.json'
    result=[]
    for f in json.loads(path.read_text())['features']:
        g=f['geometry'];parts=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        for rings in parts:
            xs,ys=zip(*[(p[0],p[1]) for p in rings[0]])
            result.append((min(xs),min(ys),max(xs),max(ys),rings))
    return result

def inside(x,y,ring):
    value=False;j=len(ring)-1
    for i,(xi,yi,*_) in enumerate(ring):
        xj,yj=ring[j][:2]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:value=not value
        j=i
    return value

def in_france(lat,lon):
    if not math.isfinite(lat) or not math.isfinite(lon):return False
    return any(x0<=lon<=x1 and y0<=lat<=y1 and inside(lon,lat,r[0]) and not any(inside(lon,lat,h) for h in r[1:]) for x0,y0,x1,y1,r in polygons())
