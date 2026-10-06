import { describe, it, expect } from "vitest";
import { defaults, matches, recentlyValidated, distance } from "./geo";
import { LYON, type Place, type Detail } from "./types";
import { enrichImported } from "./place-enrichment";
import { applyPersonal, mergePersonal, personalDetail } from "./personal";
import { mergePlaceData } from "./group-places";
import { isImmediatelyNearby } from "./nearby-prompt";
import seed from "../public/seed.json";
import catalog from "../public/catalog-family-017.json";
import toilets from "../public/catalog-toilets-017.json";

const p = {...seed.find(p => p.category === "toilet")!, rating: null, review_count: 0} as Place;
const now = Date.parse("2026-09-16T12:00:00Z");
describe("Filtres des familles", () => {
  it("combine les trois modes indépendants et l’accessibilité confirmée", () => {
    const stop = {...p, category: "transit", transit_modes: ["metro", "bus"], wheelchair: false} as Place;
    expect(matches(stop, {...defaults, transitModes: ["metro"]}, LYON)).toBe(true);
    expect(matches(stop, {...defaults, transitModes: ["bus"]}, LYON)).toBe(true);
    expect(matches(stop, {...defaults, transitModes: ["tram"]}, LYON)).toBe(false);
    expect(matches(stop, {...defaults, transitModes: []}, LYON)).toBe(false);
    for (const wheelchair of [false, null]) expect(matches({...stop, wheelchair}, {...defaults, pmr: true}, LYON)).toBe(false);
    expect(matches({...stop, wheelchair: true}, {...defaults, pmr: true}, LYON)).toBe(true);
  });
  it("Public et Bio excluent les valeurs inconnues sans masquer les autres catégories", () => {
    for (const value of [null, false, undefined]) {
      expect(matches({...p, toilet_public: value}, {...defaults, publicToilets: true}, LYON)).toBe(false);
      expect(matches({...p, category: "food_shop", shop_type: "supermarket", organic: value}, {...defaults, organic: true}, LYON)).toBe(false);
    }
    expect(matches({...p, toilet_public: true}, {...defaults, publicToilets: true}, LYON)).toBe(true);
    expect(matches({...p, category: "food_shop", shop_type: "supermarket", organic: true}, {...defaults, organic: true}, LYON)).toBe(true);
    expect(matches({...p, category: "playground"}, {...defaults, publicToilets: true, organic: true}, LYON)).toBe(true);
  });
  it("ne confond ni absence d’avis, ni import, avec note et validation", () => {
    expect(matches({...p, rating: 5, review_count: 0}, {...defaults, minRating: 4}, LYON)).toBe(false);
    expect(matches({...p, rating: 4, review_count: 1}, {...defaults, minRating: 4}, LYON)).toBe(true);
    expect(matches({...p, rating: 3.9, review_count: 1}, {...defaults, minRating: 4}, LYON)).toBe(false);
    for (const date of [undefined, "invalid", "2025-09-16T12:00:00Z", "2026-09-17T12:00:00Z"]) expect(recentlyValidated({...p, information_validated: true, validated_at: date}, now)).toBe(false);
    expect(recentlyValidated({...p, information_validated: true, validated_at: "2025-09-16T12:00:01Z"}, now)).toBe(true);
    expect(recentlyValidated({...p, information_validated: false, validated_at: new Date(now).toISOString()}, now)).toBe(false);
    expect(matches(p, {...defaults, withPhotos: true}, LYON)).toBe(false);
    expect(matches({...p, photo_count: 1}, {...defaults, withPhotos: true}, LYON)).toBe(true);
  });
  it("compte les ajouts et suppressions de photos personnelles et les fiches regroupées", () => {
    const added = applyPersonal(p, undefined, {id: "photo-1", kind: "photo.add", place_id: p.id, payload: {base64: "aW1hZ2U="}});
    const shown = mergePersonal([p], [added])[0];
    expect(shown.photo_count).toBe(1);
    const removed = applyPersonal(p, added, {id: "delete-1", kind: "photo.delete", place_id: p.id, payload: {photo_id: added.photos[0].id}});
    expect(mergePersonal([p], [removed])[0].photo_count).toBe(0);
    const cached = {...p, reviews: [], photos: [{id: "remote", user_id: "other", url: "test", caption: "", created: ""}]} as Detail;
    expect(mergePersonal([p], [added], [cached])[0].photo_count).toBe(2);
    expect(personalDetail(cached, added).photo_count).toBe(2);
    expect(mergePersonal([{...p, photo_count: 3}], [added])[0].photo_count).toBe(4);
    expect(mergePlaceData([shown, {...p, id: "other", photo_count: 2}]).photo_count).toBe(3);
    expect(recentlyValidated(mergePlaceData([{...p, information_validated: true, validated_at: "2026-09-16"}, {...p, id: "old", information_validated: true, validated_at: "2024-01-01"}]), now)).toBe(false);
  });
});
describe("GPS pour l’invitation ponctuelle", () => {
  const position = {...p, accuracy: 5, timestamp: now};
  it("exige une position récente, précise et dans les 50 m, incertitude comprise", () => {
    expect(isImmediatelyNearby(p, position, now)).toBe(true);
    for (const change of [{accuracy: 26}, {accuracy: -1}, {timestamp: now-120001}, {timestamp: now+1}, {lat: p.lat+.001}, {lat: NaN}]) expect(isImmediatelyNearby(p, {...position,...change}, now)).toBe(false);
    expect(isImmediatelyNearby(p, {...position, lat:p.lat+.00036, accuracy: 15}, now)).toBe(false);
  });
});
describe("Qualité et priorité du catalogue", () => {
  it("conserve les corrections personnelles et les nouvelles contributions indépendantes", () => {
    const original = (seed as Place[]).find(x => enrichImported(x).organic === true)!;
    expect(original).toBeTruthy();
    const enriched = enrichImported(original);
    const edited = applyPersonal(enriched, undefined, {id: "edit", kind: "place.edit", place_id: original.id, payload: {...enriched, organic: false}});
    expect(mergePersonal([enriched], [edited])[0].organic).toBe(false);
    edited.patch.organic = null;
    expect(mergePersonal([enriched], [edited])[0].organic).toBeNull();
    const contributed = {...original, community: true};
    expect(enrichImported(contributed)).toBe(contributed);
  });
  it("associe une ligne à toutes les entrées de métro du catalogue, même non PMR", () => {
    const entries = (seed as Place[]).filter(p => p.transit_modes?.includes("metro"));
    expect(entries.some(p => p.wheelchair !== true)).toBe(true);
    for (const p of entries) expect(enrichImported(p).transit_lines?.length, p.name).toBeGreaterThan(0);
  });
  it("garde les seize bibliothèques distinctes et les nouvelles données sourcées et dans le périmètre", () => {
    const places = [...catalog, ...toilets] as Place[];
    expect(catalog.filter(p => p.website?.includes("/16-bibliotheques-et-un-bibliobus/")).length).toBe(16);
    expect(new Set(places.map(p=>p.id)).size).toBe(places.length);
    const ids = new Set(seed.map(p=>p.id));
    for (const p of places) {
      expect(ids.has(p.id)).toBe(false);
      expect(distance(p,LYON)).toBeLessThanOrEqual(30000);
      expect(p.sources.length).toBeGreaterThan(0);
      expect(p.information_validated).toBe(false);
      expect(p.rating).toBeNull();
      expect(p.review_count).toBe(0);
      expect(p.sources.every(s=>s.url.startsWith("https://") && !!s.license)).toBe(true);
    }
    for (const p of catalog.filter(p=>p.category==="playground")) {
      expect(p.fenced).toBeNull();
      expect(p.drinking_water).toBeNull();
    }
    expect(catalog.some(p=>p.name.includes("Pédiapôle") && p.health_type==="doctor" && p.pediatric===true)).toBe(true);
  });
});
