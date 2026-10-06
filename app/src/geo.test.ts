import { describe, it, expect } from "vitest";
import { distance, matches, defaults, directions, level, radiusBounds, radiusQueryExtent } from "./geo";
import { LYON, type Place } from "./types";
const p = {
  id: "test",
  name: "Toilettes",
  lat: 45.7578,
  lon: 4.832,
  category: "toilet",
  access: "public",
  wheelchair: null,
  changing_table: null,
  hours: "",
} as Place;
describe("Recherche et filtres", () => {
  it("calcule la distance en mètres", () => {
    expect(distance(LYON, p)).toBe(0);
    expect(distance({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(
      111195.08,
      1,
    );
  });
  it("ne transforme pas une information manquante en confirmation", () => {
    expect(matches(p, { ...defaults, changing: true }, LYON)).toBe(false);
    expect(
      matches(
        { ...p, changing_table: true },
        { ...defaults, changing: true },
        LYON,
      ),
    ).toBe(true);
  });
  it("distingue les horaires absents et les accès clientèle", () => {
    for (const category of ["baby_shop", "food_shop"] as const) {
      const shop = {
        ...p,
        category,
        access: "customers",
        shop_type: "supermarket",
      };
      expect(matches(shop, defaults, LYON)).toBe(true);
      expect(matches(shop, { ...defaults, open: true }, LYON)).toBe(true);
      expect(
        matches({ ...shop, hours: "24/7" }, { ...defaults, open: true }, LYON),
      ).toBe(true);
      expect(
        matches({ ...shop, hours: "off" }, { ...defaults, open: true }, LYON),
      ).toBe(false);
      expect(
        matches(
          { ...shop, hours: "24/7", condition: "temporary_closed" },
          { ...defaults, open: true },
          LYON,
        ),
      ).toBe(false);
    }
  });
  it("applique Ouvert à toutes les catégories avec des horaires fiables", () => {
    for (const category of defaults.categories) {
      const place = {
        ...p,
        category,
        shop_type: "supermarket",
        drinking_water: true,
        transit_modes: ["bus" as const],
      };
      const filters = { ...defaults, open: true, categories: [category] };
      for (const hours of ["", "   "]) {
        expect(matches({ ...place, hours }, filters, LYON)).toBe(true);
        for (const condition of ["temporary_closed", "unavailable"]) {
          expect(matches({ ...place, hours, condition }, filters, LYON)).toBe(
            false,
          );
        }
      }
      expect(
        matches(
          { ...place, hours: "", hours_variants: ["off", "Mo-Fr 09:00-18:00"] },
          filters,
          LYON,
        ),
      ).toBe(false);
      expect(matches({ ...place, hours: "24/7" }, filters, LYON)).toBe(true);
      for (const hours of ["off", "horaires non interprétables"]) {
        expect(matches({ ...place, hours }, filters, LYON)).toBe(false);
      }
      expect(
        matches(
          { ...place, hours: "24/7", condition: "temporary_closed" },
          filters,
          LYON,
        ),
      ).toBe(false);
      expect(
        matches(
          { ...place, hours: "24/7" },
          { ...filters, categories: [] },
          LYON,
        ),
      ).toBe(false);
      expect(
        matches({ ...place, hours: "" }, { ...filters, open: false }, LYON),
      ).toBe(true);
    }
  });
  it("applique la distance autour de l’origine, même sans géolocalisation", () => {
    const far = { ...p, lat: 45.8 };
    expect(matches(far, { ...defaults, radius: 500 }, LYON)).toBe(false);
    expect(
      matches(far, { ...defaults, radius: 500 }, { ...LYON, chosen: true }),
    ).toBe(false);
  });
  it("délègue les quatre modes sans inventer de durée", () => {
    for (const mode of ["walking", "bicycling", "transit", "driving"]) {
      const url = new URL(directions(p, mode, LYON));
      expect(url.searchParams.get("travelmode")).toBe(mode);
      expect(url.searchParams.has("origin")).toBe(false);
    }
  });
  it("affiche les données absentes en gris et respecte les seuils", () => {
    expect(level("uv", null)).toBe("unknown");
    expect(level("uv", 6)).toBe("red");
    expect(level("aqi", 60)).toBe("orange");
    expect(level("aqi", 61)).toBe("red");
  });
});

it('couvre un rayon de 50 km, avec des requêtes stables entre deux paliers',()=>{
 for(const lat of [42,46,51]){
  const origin={lat,lon:3},b=radiusBounds(origin,50000);
  expect(distance(origin,{lat:b.north,lon:3})).toBeCloseTo(50000,4);
  for(const lon of [b.west,b.east])expect(distance(origin,{lat,lon})).toBeGreaterThanOrEqual(49990);
 }
 expect(radiusQueryExtent(8100)).toBe(10000);expect(radiusQueryExtent(8200)).toBe(10000);expect(radiusQueryExtent(50000)).toBe(50000);
});
it('un ancien réglage inclure les âges inconnus ne contourne plus une tranche choisie',()=>{
 expect(matches({...p,category:'playground',age:''},{...defaults,ageBand:'3-5',includeUnknownAge:true},LYON)).toBe(false);
 expect(matches({...p,category:'playground',age:''},{...defaults,ageBand:null},LYON)).toBe(true);
});
