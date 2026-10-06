import type { Place, TransitMode } from "./types";
export type TransitRoute = {
  id: string;
  resourceId?: string;
  mode: TransitMode;
  line: string;
  color: string;
  paths: [number, number][][];
  destinations: string[];
};
// Évite d'associer un arrêt à une ligne homonyme qui passe dans un autre secteur.
export function routeDistance(
  route: TransitRoute,
  place: Pick<Place, "lat" | "lon">,
) {
  const xScale = 111320 * Math.cos((place.lat * Math.PI) / 180);
  let closest = Infinity;
  for (const path of route.paths)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      const ax = (a[1] - place.lon) * xScale,
        ay = (a[0] - place.lat) * 111320;
      const bx = (b[1] - place.lon) * xScale,
        by = (b[0] - place.lat) * 111320;
      const dx = bx - ax,
        dy = by - ay,
        length = dx * dx + dy * dy;
      const t = length
        ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length))
        : 0;
      closest = Math.min(closest, Math.hypot(ax + t * dx, ay + t * dy));
    }
  return closest;
}
export function routesForStop(routes: TransitRoute[], place: Place) {
  if (place.category !== "transit") return [];
  const lines = new Set(
    (place.transit_lines || []).map((s) => s.trim().toUpperCase()),
  );
  return routes.filter(
    (route) =>
      (!route.resourceId || place.sources.some(s=>s.key.startsWith(`gtfs:${route.resourceId}:`))) &&
      lines.has(route.line.trim().toUpperCase()) &&
      (!place.transit_modes?.length ||
        place.transit_modes.includes(route.mode)) &&
      routeDistance(route, place) <= 250,
  );
}
