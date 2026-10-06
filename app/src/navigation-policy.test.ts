import { expect, it } from "vitest";
import {
  needsPmrPlanner,
  travelModes,
  tclDestination,
} from "./navigation-policy";

it("limite le mode PMR et impose le passage par le calculateur adapté", () => {
  expect(travelModes(true)).toEqual(["walking", "transit", "driving"]);
  expect(travelModes(false)).toContain("bicycling");
  expect(needsPmrPlanner(true, "transit")).toBe(true);
  for (const mode of ["walking", "driving", "bicycling"])
    expect(needsPmrPlanner(true, mode)).toBe(false);
  expect(needsPmrPlanner(false, "transit")).toBe(false);
});

it("transmet une adresse complète ou des coordonnées sans inventer d’adresse", () => {
  const point = { lat: 45.75, lon: 4.83, city: "Lyon" };
  expect(tclDestination(point)).toBe("45.75, 4.83");
  expect(tclDestination({ ...point, address: "12 rue de la République" })).toBe(
    "12 rue de la République, Lyon",
  );
});
