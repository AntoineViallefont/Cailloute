import { describe, it, expect } from "vitest";
import { groupPlaces, mergePlaceData } from "./group-places";
import { groupMetroStations } from "./metro-stations";
import type { Place } from "./types";
import { barycentre } from "./place-position";
import { groupEdits } from "./group-edits";
import seed from "../public/seed.json";
const place = (id: string, lon = 4.832, patch: Partial<Place> = {}): Place => ({
  id, version: 1, name: "Square", category: "playground", lat: 45.7578, lon,
  address: "", city: "Lyon", hours: "", description: "", age: "", access: "public",
  wheelchair: null, changing_table: null, drinking_water: null, free: null, fenced: null, elevator: null,
  sources: [], rating: null, review_count: 0, ...patch,
});
describe("Regroupement des lieux", () => {
  it("réunit les équipements, les descriptions et les sources sans les répéter", () => {
    const [p] = groupPlaces([place("a", 4.832, { description: "Entrée sud", fenced: true }),
      place("b", 4.83204, { description: "Entrée sud", toilets_available: true })]);
    expect(p).toMatchObject({ fenced: true, toilets_available: true, description: "Entrée sud" });
    expect(p.merged_members?.length).toBe(2);
  });
  it("conserve une contradiction comme information inconnue", () => {
    const p = mergePlaceData([place("a", 4.832, { drinking_water: true }), place("b", 4.832, { drinking_water: false })]);
    expect(p.drinking_water).toBe(null);expect(p.merged_conflicts).toContain("drinking_water");
  });
  it("sépare les catégories et réunit les imports de noms distincts à moins de 20 m", () => {
    expect(groupPlaces([place("a", 4.832, { category: "food_shop" }), place("b", 4.832, { category: "toilet" }), place("c", 4.832, { category: "food_shop", name: "Autre commerce" })])).toHaveLength(2);

  });
  it("empêche les regroupements en chaîne au-delà du seuil", () => {
    expect(groupPlaces([place("a",4.832,{name:"Square Jean Jaurès"}), place("b",4.8328,{name:"Square Jean Jaurès"}),place("c",4.8336,{name:"Square Jean Jaurès"})])).toHaveLength(2);
  });
  it("regroupe les lignes et accès d'une station, en plaçant le repère au barycentre", () => {
    const a = place("a", 4.832, { category: "transit", name: "Charpennes - Charles Hernu (Ligne A)", wheelchair: true, elevator: true, transit_modes: ["metro"], transit_lines: ["A"] });
    const b = place("b", 4.833, { ...a, id: "b", lon: 4.833, name: "Charpennes Charles Hernu", elevator: null, transit_lines: ["B"] });
    const result = groupMetroStations([a,b]);expect(result).toHaveLength(1);expect(result[0]).toMatchObject({ id: "a", transit_lines: ["A","B"] });expect(result[0].lon).toBeCloseTo(4.8325, 8);
    expect(groupMetroStations([a,{...b,lon:4.84}])).toHaveLength(2);
  });
  it("ne rattache pas un accès anonyme ambigu entre deux stations", () => {
    const metro = { category: "transit", wheelchair: true, transit_modes: ["metro"] } as Partial<Place>;
    expect(groupMetroStations([place("a",4.831,{...metro,name:"Station A"}),place("b",4.833,{...metro,name:"Station B"}),place("c",4.832,{...metro,name:"Arrêt de transport"})])).toHaveLength(3);
  });
  it("réunit les noms équivalents jusqu’à 80 m", () => {
    const a = place("a", 4.832, { name: "Aire de jeux Jean-Jaurès", description: "Toboggan", age: "2–6 ans" });
    const b = place("b", 4.8328, { name: "Square Jean Jaures", description: "Balançoires", age: "6–12 ans" });
    const [p] = groupPlaces([a, b]);
    expect(p.merged_members).toHaveLength(2);
    expect(p.description).toBe("Toboggan\n\nBalançoires");
    expect(p.age).toContain("6–12 ans");
    expect(p.lon).toBeCloseTo(4.8324, 8);
    expect(groupPlaces([a, { ...b, lon: 4.834 }])).toHaveLength(2);
    expect(groupPlaces([b, a])).toEqual(groupPlaces([a, b]));
  });
  it("signale les données contradictoires des doublons à moins de 20 m", () => {
    expect(groupPlaces([place("a", 4.832, { category: "water", drinking_water: true }),
      place("b", 4.8321, { category: "water", drinking_water: false })])[0].drinking_water).toBeNull();
  });
  it("calcule le barycentre sans surpondérer une position importée plusieurs fois", () => {
    const a = { lat: 45.7578, lon: 4.832 }, b = { lat: 45.7582, lon: 4.8328 };
    expect(barycentre([a, a, b])).toEqual(barycentre([a, b]));
    expect(barycentre([a])).toEqual(a);
    expect(barycentre([a, b]).lat).toBeCloseTo(45.758, 7);
    expect(barycentre([a, b]).lon).toBeCloseTo(4.8324, 7);
  });
  it("répercute une correction sans écraser les positions et informations non modifiées", () => {
    const members = [place("a", 4.832, { description: "Toboggan", drinking_water: true, city: "Lyon" }),
      place("b", 4.8328, { description: "Banc", drinking_water: false, city: "Autre commune" })];
    const p = mergePlaceData(members);
    const initial = { name: p.name, category: p.category, lat: p.lat, lon: p.lon, city: p.city, description: p.description, drinking_water: p.drinking_water };
    const edits = groupEdits(p, initial, { ...initial, drinking_water: true, description: "Texte corrigé" });
    expect(edits.map((edit) => edit.payload.lon)).toEqual([4.832, 4.8328]);
    expect(edits.map((edit) => edit.payload.city)).toEqual(["Lyon", "Autre commune"]);
    expect(edits.every((edit) => edit.payload.drinking_water === true && edit.payload.description === "Texte corrigé")).toBe(true);
    const moved = groupEdits(p, initial, { ...initial, lat: 45.75, lon: 4.83 });
    expect(moved.every((edit) => edit.payload.lat === 45.75 && edit.payload.lon === 4.83)).toBe(true);
  });
  it("réduit les doublons du catalogue réel sans perdre d'identifiants", () => {
    const result=groupPlaces(seed as Place[]);
    const before=(seed as Place[]).filter((p)=>p.transit_modes?.includes("metro")&&p.wheelchair===true);
    const after=result.filter((p)=>p.group_kind==="station");
    console.log(`Catalogue : ${seed.length} → ${result.length} lieux affichés ; métro PMR ${before.length} → ${after.length}.`);
    expect(after.length).toBeLessThan(before.length/2);
    expect(new Set(result.flatMap((p)=>(p.merged_members||[p]).map((m)=>m.id))).size).toBe(seed.length);
  });
});

it("garde les contributions distinctes des imports et entre elles, même au même point", () => {
  const imports = [place("import-a"), place("import-b")];
  const personal = [place("c_a", 4.832, { community: true }), place("c_b", 4.832, { community: true })];
  const result = groupPlaces([...imports, ...personal]);
  expect(result).toHaveLength(3);
  expect(result.find((p) => p.id === "c_a")?.merged_members).toBeUndefined();
  const metro = { category: "transit", wheelchair: true, transit_modes: ["metro"], name: "Charpennes" } as Partial<Place>;
  expect(groupPlaces([place("import-m", 4.832, metro), place("c_m", 4.832, { ...metro, community: true })])).toHaveLength(2);
});
it("pondère les notes par le nombre d'avis et exige la validation de tous les membres", () => {
  const a = place("a", 4.832, { rating: 5, review_count: 1, information_validated: true, validated_at: "2026-09-15T10:00:00Z" });
  const b = place("b", 4.832, { rating: 2, review_count: 3 });
  expect(mergePlaceData([a,b])).toMatchObject({ rating: 2.75, review_count: 4, information_validated: false });
  expect(mergePlaceData([a, {...b,information_validated:true}]).information_validated).toBe(true);
});

it("fusionne les doubles et triples de noms différents sous 20 m sans chaîne ni perte de données", () => {
  const a = place("a",4.832,{category:"child_activity",name:"Musée municipal",description:"Collection",photo_count:2});
  const b = place("b",4.8321,{category:"child_activity",name:"Musée de la ville",description:"Visites",photo_count:1});
  const c = place("c",4.8322,{category:"child_activity",name:"Espace culturel",photo_count:1});
  const result = groupPlaces([c,b,a]);
  expect(result).toHaveLength(1);
  expect(result[0].merged_members?.map(p=>p.id)).toEqual(["a","b","c"]);
  expect(result[0]).toMatchObject({description:"Collection\n\nVisites",photo_count:4});
  expect(groupPlaces([a,{...b,lon:4.8323}])).toHaveLength(2);
  expect(groupPlaces([a,c,{...b,id:"d",lon:4.8324}])).toHaveLength(2);
});
