type Position = { lat: number; lon: number };
// Barycentre des positions distinctes sur la sphère ; les imports au même point ne le surpondèrent pas.
export function barycentre(positions: Position[]): Position {
  const unique = [
    ...new Map(positions.map((p) => [`${p.lat},${p.lon}`, p])).values(),
  ];
  if (!unique.length) throw new Error("Aucune position à réunir.");
  if (unique.length === 1) return { lat: unique[0].lat, lon: unique[0].lon };
  const rad = Math.PI / 180;
  let x = 0,
    y = 0,
    z = 0;
  for (const p of unique) {
    const lat = p.lat * rad,
      lon = p.lon * rad;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  return {
    lat: Math.atan2(z, Math.hypot(x, y)) / rad,
    lon: Math.atan2(y, x) / rad,
  };
}
