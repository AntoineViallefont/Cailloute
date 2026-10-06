import { expect, it } from "vitest";
import catalog from "../public/catalog-health-015.json";
import { distance } from "./geo";
import { LYON } from "./types";

it("importe uniquement des adresses pédiatriques sourcées et localisées dans le périmètre", () => {
  expect(catalog.length).toBe(54);
  expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
  for (const place of catalog) {
    expect(place.category).toBe("health");
    expect(place.health_type).toBe("doctor");
    expect(place.pediatric).toBe(true);
    expect(place.information_validated).toBe(false);
    expect(place.address.length).toBeGreaterThan(0);
    expect(distance(LYON, place)).toBeLessThanOrEqual(30000);
    expect(place.sources.some((s) => s.name.includes("RPPS"))).toBe(true);
    expect(place.sources.every((s) => s.license === "Licence Ouverte 2.0")).toBe(true);
  }
});
