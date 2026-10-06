import boundaries from "./france-boundaries.json";
// Contours IGN/Etalab simplifiés à 100 m : contrôle territorial, pas une limite cadastrale.
const areas = boundaries.features.flatMap(f => {
  const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return (polygons as number[][][][]).map(rings => {
    const pts = rings[0];
    return { rings, minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minY: Math.min(...pts.map(p => p[1])), maxY: Math.max(...pts.map(p => p[1])) };
  });
});
function inside(x: number, y: number, ring: number[][]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
export function inFrance(p: {lat: number; lon: number}) {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
  return areas.some(a => p.lon >= a.minX && p.lon <= a.maxX && p.lat >= a.minY && p.lat <= a.maxY && inside(p.lon, p.lat, a.rings[0]) && !a.rings.slice(1).some(r => inside(p.lon, p.lat, r)));
}
