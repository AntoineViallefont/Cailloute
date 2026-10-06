import { describe, expect, it } from "vitest";
import { boundedMask, expandedFace } from "./photo-masks";
describe("Zones de confidentialité", () => {
  it("élargit le cadre détecté pour couvrir les bords du visage", () => {
    const m = expandedFace({ x: 0.3, y: 0.3, width: 0.2, height: 0.2 })!;
    expect(m.x).toBeCloseTo(0.22);
    expect(m.y).toBeCloseTo(0.2);
    expect(m.width).toBeCloseTo(0.36);
    expect(m.height).toBeCloseTo(0.4);
  });
  it("conserve la partie visible des visages sur les bords", () => {
    expect(boundedMask({ x: -0.1, y: 0.9, width: 0.3, height: 0.3 })).toEqual({
      x: 0,
      y: 0.9,
      width: 0.19999999999999998,
      height: 0.09999999999999998,
    });
    expect(boundedMask({ x: 0, y: 0, width: 1, height: 1 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
  it("rejette les cadres invalides ou entièrement hors image", () => {
    for (const m of [
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 1.1, y: 0, width: 0.1, height: 0.1 },
    ])
      expect(boundedMask(m)).toBeNull();
  });
});

import { detectionAreas } from "./photo-detection-areas";
describe("Recherche des visages lointains", () => {
  it("couvre les bords et conserve des cadrages se chevauchant", () => {
    const areas = detectionAreas(6000, 4000);
    expect(areas.length).toBeGreaterThan(1);
    expect(areas.length).toBeLessThanOrEqual(5);
    for (const a of areas) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(1.00001);
      expect(a.y + a.height).toBeLessThanOrEqual(1.00001);
    }
    const last = areas.at(-1)!;
    expect(last.x + last.width).toBeCloseTo(1);
    expect(last.y + last.height).toBeCloseTo(1);
    // Un petit sujet occupe davantage de pixels dans chaque cadrage.
    expect(50 / (areas[1].width * 6000)).toBeGreaterThan(50 / 6000);
  });
  it("évite les cadrages inutiles sur les petites images", () => {
    expect(detectionAreas(360, 240)).toHaveLength(1);
  });
});
