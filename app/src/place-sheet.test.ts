import { expect, it } from "vitest";
import { consumeSheetMotion, settleSheet } from "./place-sheet";
it("défile vers le début avant de réduire, même pendant le même geste", () => {
  expect(consumeSheetMotion(800, 120, -80, 800, 1000)).toEqual({
    height: 800,
    scroll: 40,
  });
  expect(consumeSheetMotion(800, 40, -100, 800, 1000)).toEqual({
    height: 740,
    scroll: 0,
  });
});
it("agrandit puis transmet le mouvement restant au contenu", () => {
  expect(consumeSheetMotion(400, 0, 450, 800, 1000)).toEqual({
    height: 800,
    scroll: 50,
  });
  expect(consumeSheetMotion(800, 990, 100, 800, 1000)).toEqual({
    height: 800,
    scroll: 1000,
  });
});
it("ferme la demi-fiche et ignore les petits déplacements", () => {
  expect(settleSheet(false, 300, 800)).toBe("closed");
  expect(settleSheet(false, 380, 800)).toBe("half");
  expect(settleSheet(false, 460, 800)).toBe("full");
  expect(settleSheet(true, 700, 800)).toBe("half");
  expect(settleSheet(true, 780, 800)).toBe("full");
});
it("la poignée peut réduire sans modifier la position de lecture", () => {
  expect(consumeSheetMotion(800, 200, -100, 800, 1000, false)).toEqual({
    height: 700,
    scroll: 200,
  });
});
