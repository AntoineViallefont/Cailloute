import {protectedPlace} from "./place-rules";
import { compatiblePlaceIdentity, groupingDistance, PROXIMITY_MERGE_METRES } from "./place-match";
import { barycentre } from "./place-position";
import { distance } from "./geo";
import { groupMetroStations } from "./metro-stations";
import type { Place } from "./types";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const generic = (s: string) =>
  /^(aire(s)? (de )?jeux( pour enfants)?|jeux( pour enfants)?|toilettes( publiques)?|fontaine|point d eau( potable)?|arret de transport)$/.test(
    normalize(s),
  );
const uniqueText = (values: string[]) => [
  ...new Map(
    values.filter((v) => v?.trim()).map((v) => [normalize(v), v.trim()]),
  ).values(),
];
const observations = [
  "organic",
  "toilet_public",
  "baby_food",
  "children_clothes",
  "drinking_water",
  "toilets_available",
  "changing_table",
  "wheelchair",
  "elevator",
  "free",
  "fenced",
  "shade",
  "shelter",
  "bench",
] as const;
export function mergePlaceData(members: Place[]): Place {
  const first = members[0];
  const merged = {
    ...first,
    ...barycentre(members),
    merged_members: members,
    location_kind:
      members.length > 1 ? "approximate_center" : first.location_kind,
  };
  merged.name =
    (first.category === "playground"
      ? members.find(
          (p) =>
            /^(aire|square|parc|jardin|espace)\b/i.test(p.name) &&
            !generic(p.name),
        )?.name
      : undefined) ||
    members.find((p) => !generic(p.name))?.name ||
    first.name;
  merged.related_names =
    first.category === "playground"
      ? uniqueText(members.map((p) => p.name)).filter(
          (name) =>
            !generic(name) && normalize(name) !== normalize(merged.name),
        )
      : [];
  merged.hours_variants = uniqueText(members.map((p) => p.hours));
  merged.description = uniqueText(
    members.flatMap((p) => (p.description || "").split(/\n\s*\n/)),
  ).join("\n\n");
  merged.age = uniqueText(members.map((p) => p.age)).join(" · ");
  merged.sources = [
    ...new Map(
      members.flatMap((p) => p.sources || []).map((s) => [s.key, s]),
    ).values(),
  ];
  merged.transit_lines = [
    ...new Set(members.flatMap((p) => p.transit_lines || [])),
  ].sort();
  merged.transit_modes = [
    ...new Set(members.flatMap((p) => p.transit_modes || [])),
  ];
  merged.merged_conflicts = [];
  for (const key of observations) {
    const values = new Set(members.map((p) => p[key]).filter((v) => v != null));
    merged[key] = values.size === 1 ? [...values][0] : null;
    if (values.size > 1) merged.merged_conflicts.push(key);
  }
  for (const key of ["address", "city", "hours", "access"] as const) {
    const values = uniqueText(
      members.map((p) => p[key]).filter((v) => v && v !== "unknown"),
    );
    merged[key] = values[0] || first[key];
    if (values.length > 1 && key === "hours") {
      merged.hours = "";
      merged.merged_conflicts.push(key);
    }
  }
  merged.photo_count = members.reduce((sum, p) => sum + (p.photo_count || 0), 0);
  merged.review_count = members.reduce((sum, p) => sum + (p.rating == null ? 0 : p.review_count), 0);
  merged.rating = merged.review_count
    ? members.reduce((sum, p) => sum + (p.rating ?? 0) * p.review_count, 0) / merged.review_count
    : null;
  merged.information_validated = members.every((p) => p.information_validated === true);
  merged.validated_at = members.map((p) => p.validated_at || "").sort().at(0) || undefined;
  merged.validation_changed_at = members.map((p) => p.validation_changed_at || "").sort().at(-1) || undefined;
  return merged;
}

export function groupPlaces(places: Place[]): Place[] {
  // Les lieux créés par contribution gardent leur propre repère, même au même endroit.
  const independent = places.filter(protectedPlace);
  const metro = groupMetroStations(places.filter((p) => !independent.includes(p)));
  const result: Place[] = independent.filter((p) => !p.deleted && !p.redirect && !p.withdrawn);
  const groups: Place[][] = [];
  const cells = new Map<string, Place[][]>();
  const cell = (p: Place) => [
    Math.floor((p.lat * 111000) / 100),
    Math.floor((p.lon * 78000) / 100),
  ];
  const compatible = compatiblePlaceIdentity;
  for (const p of [...metro].sort(
    (a, b) =>
      Number(generic(a.name)) - Number(generic(b.name)) ||
      a.id.localeCompare(b.id),
  )) {
    if (p.deleted || p.redirect || p.withdrawn) continue;
    if (p.merged_members) {
      result.push({
        ...mergePlaceData(p.merged_members),
        group_kind: "station",
      });
      continue;
    }
    const threshold = Math.max(PROXIMITY_MERGE_METRES, groupingDistance[p.category]);
    const [x, y] = cell(p);
    const candidates: Place[][] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        candidates.push(
          ...(cells.get(`${p.category}:${x + dx}:${y + dy}`) || []),
        );
    const target = candidates
      .sort((a, b) => distance(p, a[0]) - distance(p, b[0]))
      .find((g) =>
        g.every((q) => compatible(p, q) && distance(p, q) <= threshold),
      );
    if (target) target.push(p);
    else {
      const group = [p];
      groups.push(group);
      const key = `${p.category}:${x}:${y}`;
      cells.set(key, [...(cells.get(key) || []), group]);
    }
  }
  return [
    ...result,
    ...groups.map((members) =>
      members.length === 1
        ? members[0]
        : { ...mergePlaceData(members), group_kind: "nearby" as const },
    ),
  ];
}
