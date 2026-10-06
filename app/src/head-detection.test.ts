import { describe, it, expect } from "vitest";
import {
  decodeHeads,
  suppressDuplicateHeads,
  headMask,
} from "./head-detection";
describe("Détection de plusieurs têtes", () => {
  it("décode toutes les têtes et ignore les autres classes", () => {
    const data = new Float32Array(38 * 100);
    const add = (index: number, x: number, score: number, category = 7) => {
      data[index] = x;
      data[100 + index] = 200;
      data[200 + index] = 30;
      data[300 + index] = 40;
      data[(4 + category) * 100 + index] = score;
    };
    add(0, 100, 0.9);
    add(1, 300, 0.8);
    add(2, 500, 0.9, 0);
    add(3, 500, 0.1);
    const heads = decodeHeads(data, [1, 38, 100], {
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.4,
    });
    expect(heads).toHaveLength(2);
    expect(heads[0].x).toBeCloseTo(0.2 + (85 / 640) * 0.4);
  });
  it("accepte aussi la sortie avec canaux en dernière dimension", () => {
    const data = new Float32Array(38 * 100);
    data[0] = 320;
    data[1] = 320;
    data[2] = 64;
    data[3] = 64;
    data[11] = 0.9;
    expect(
      decodeHeads(data, [1, 100, 38], { x: 0, y: 0, width: 1, height: 1 }),
    ).toHaveLength(1);
  });
  it("déduplique les cadrages sans fusionner deux personnes voisines", () => {
    const a = { x: 0.1, y: 0.2, width: 0.1, height: 0.1, score: 0.9 };
    expect(
      suppressDuplicateHeads([
        a,
        { ...a, x: 0.101, score: 0.8 },
        { ...a, x: 0.3 },
      ]),
    ).toHaveLength(2);
  });
  it("ajoute une marge arrondie autour de toute la tête", () => {
    const mask = headMask({ x: 0.3, y: 0.4, width: 0.1, height: 0.1 });
    expect(mask.rounded).toBe(true);
    expect(mask.x).toBeLessThan(0.3);
    expect(mask.y).toBeLessThan(0.4);
    expect(mask.x + mask.width).toBeGreaterThan(0.4);
  });
});
