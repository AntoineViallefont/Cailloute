import { describe, expect, it } from "vitest";
import { defaults, matches, selectedPrices, allPrices } from "./geo";
import { LYON, type Place } from "./types";
describe("Tarifs cumulables", () => {
  it("accepte exactement les tarifs choisis pour les huit combinaisons", () => {
    const place = { id: "price-test", category: "toilet", lat: LYON.lat, lon: LYON.lon } as Place;
    for (let mask = 0; mask < 8; mask++) {
      const prices = allPrices.filter((_, index) => mask & (1 << index));
      for (const [index, free] of [true, false, null].entries()) {
        expect(matches({ ...place, free }, { ...defaults, prices }, LYON)).toBe(prices.includes(allPrices[index]));
      }
    }
  });
  it("conserve le tarif précédent et réinitialise les trois tarifs", () => {
    for (const price of allPrices) expect(selectedPrices({ price })).toEqual([price]);
    expect(selectedPrices(defaults)).toEqual(allPrices);
    expect(selectedPrices({ price: "paid", prices: [] })).toEqual([]);
    expect(selectedPrices({ price: "free", prices: ["paid", "unknown"] })).toEqual(["paid", "unknown"]);
  });
});
