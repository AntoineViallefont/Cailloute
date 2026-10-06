import { describe, expect, it } from "vitest";
import { radiusFromSlider, radiusToSlider, matches, defaults } from "./geo";
import { familyFoodShop, categoryMatches } from "./place-rules";
import { LYON, type Place } from "./types";
const food = {
  id: "import",
  name: "Commerce",
  category: "food_shop",
  lat: LYON.lat,
  lon: LYON.lon,
} as Place;
describe("Catalogue famille et distance", () => {
  it("exclut drogueries et commerces non confirmés, respecte la confirmation personnelle", () => {
    expect(familyFoodShop({ ...food, shop_type: "chemist" })).toBe(false);
    expect(familyFoodShop({ ...food, shop_type: "convenience" })).toBe(false);
    expect(familyFoodShop({ ...food, shop_type: "supermarket" })).toBe(true);
    expect(
      familyFoodShop({ ...food, shop_type: "supermarket", baby_food: false }),
    ).toBe(false);
    expect(familyFoodShop({ ...food, baby_food: true })).toBe(true);
    expect(familyFoodShop({ ...food, id: "c_mine", community: true })).toBe(
      true,
    );
    expect(familyFoodShop({ ...food, id: "c_mine", baby_food: false })).toBe(
      false,
    );
  });
  it("fait apparaître un hypermarché dans les deux filtres sans le dupliquer", () => {
    const hyper = { ...food, shop_type: "supermarket", children_clothes: true };
    expect(categoryMatches(hyper, ["baby_shop"])).toBe(true);
    expect(categoryMatches(hyper, ["food_shop"])).toBe(true);
    expect(
      categoryMatches({ ...hyper, children_clothes: false }, ["baby_shop"]),
    ).toBe(false);
    const clothes = {
      ...food,
      category: "baby_shop",
      children_clothes: true,
    } as Place;
    expect(categoryMatches(clothes, ["baby_shop"])).toBe(true);
    expect(categoryMatches(clothes, ["food_shop"])).toBe(false);
  });
  it("offre une progression monotone de 100 m à 50 km et une précision de 10 m à proximité", () => {
    expect(radiusFromSlider(0)).toBe(100);
    expect(radiusFromSlider(1000)).toBe(50000);
    let last = 100;
    for (let x = 0; x <= 1000; x++) {
      const next = radiusFromSlider(x);
      expect(next).toBeGreaterThanOrEqual(last);
      if (next < 1000) expect(next - last).toBeLessThanOrEqual(10);
      last = next;
    }
    for (const m of [100, 110, 250, 500, 1000, 1750, 5000, 30000, 50000])
      expect(radiusFromSlider(radiusToSlider(m))).toBe(m);
  });
  it("applique catégories et distance aux lieux de santé sans supposer leur accessibilité", () => {
    const p = { ...food, category: "health", health_type: "pharmacy" } as Place;
    expect(matches(p, defaults, LYON)).toBe(true);
    expect(matches(p, { ...defaults, healthTypes: ["doctor"] }, LYON)).toBe(
      false,
    );
    expect(matches(p, { ...defaults, healthTypes: ["pharmacy"] }, LYON)).toBe(
      true,
    );
    expect(matches(p, { ...defaults, categories: ["playground"] }, LYON)).toBe(
      false,
    );
    expect(
      matches(
        { ...p, lat: p.lat + 0.01 },
        { ...defaults, radius: 100 },
        { ...LYON, chosen: true },
      ),
    ).toBe(false);
  });
});

it("ne montre que les pédiatres parmi les médecins et conserve toutes les urgences", () => {
  const p = { ...food, category: "health", health_type: "doctor" } as Place;
  expect(matches(p, defaults, LYON)).toBe(false);
  expect(matches({ ...p, pediatric: false }, defaults, LYON)).toBe(false);
  expect(matches({ ...p, pediatric: true }, defaults, LYON)).toBe(true);
  for (const pediatric of [true, false, null])
    expect(
      matches({ ...p, health_type: "emergency", pediatric }, defaults, LYON),
    ).toBe(true);
});
