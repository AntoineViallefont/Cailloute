import { barycentre } from "./place-position";
import { distance } from "./geo";
import type { Place } from "./types";

// Variantes réellement présentes dans les sources TCL / OSM du catalogue lyonnais.
export function stationName(name: string) {
  let key = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\(ligne [a-d]\)/g, "")
    .replace(/ascenseur.*$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const aliases: [RegExp, string][] = [
    [/^hotel de ville/, "hotel de ville louis pradel"],
    [/^gare part dieu/, "gare part dieu vivier merle"],
    [/^gare de vaise/, "gare de vaise"],
    [/^guillotiere/, "guillotiere gabriel peri"],
    [/^laurent bonnevay/, "laurent bonnevay astroballe"],
    [/^monplaisir/, "monplaisir lumiere"],
    [/^place guichard/, "place guichard bourse du travail"],
    [/^(saint|st) genis laval/, "saint genis laval hopital lyon sud"],
    [/^vieux lyon/, "vieux lyon cathedrale saint jean"],
    [/^(gare de )?venissieux$/, "gare de venissieux"],
  ];
  for (const [pattern, value] of aliases) if (pattern.test(key)) key = value;
  return ["", "arret de transport", "metro", "station de metro"].includes(key)
    ? ""
    : key;
}
const priority = (p: Place) =>
  (p.elevator === true ? 0 : 2) +
  (p.sources?.some((s) => s.name === "arrets_tcl") ? 0 : 1);
export function groupMetroStations(places: Place[]): Place[] {
  const metros = places.filter(
    (p) =>
      !p.deleted &&
      !p.redirect &&
      !p.withdrawn &&
      p.category === "transit" &&
      p.transit_modes?.includes("metro") &&
      p.wheelchair === true,
  );
  const groups: Place[][] = [];
  const ordered = [...metros].sort(
    (a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id),
  );
  for (const p of ordered.filter((p) => stationName(p.name))) {
    const key = stationName(p.name);
    // Distance à tous les membres : pas de fusion en chaîne de stations distinctes.
    const group = groups.find(
      (g) =>
        stationName(g[0].name) === key && g.every((q) => distance(p, q) <= 250),
    );
    if (group) group.push(p);
    else groups.push([p]);
  }
  for (const p of ordered.filter((p) => !stationName(p.name))) {
    const nearest = groups
      .filter((g) => stationName(g[0].name))
      .map((g) => ({ g, d: Math.min(...g.map((q) => distance(p, q))) }))
      .sort((a, b) => a.d - b.d);
    if (
      nearest[0]?.d <= 150 &&
      (!nearest[1] || nearest[1].d - nearest[0].d >= 50)
    )
      nearest[0].g.push(p);
    else groups.push([p]);
  }
  const groupedIds = new Set(metros.map((p) => p.id));
  return [
    ...places.filter((p) => !groupedIds.has(p.id)),
    ...groups.map((members) => ({
      ...members[0],
      ...barycentre(members),
      transit_lines: [
        ...new Set(members.flatMap((p) => p.transit_lines || [])),
      ].sort(),
      transit_modes: [
        ...new Set(members.flatMap((p) => p.transit_modes || [])),
      ],
      merged_members: members,
    })),
  ];
}
