import { describe, it, expect } from "vitest";
import { rainLevel } from "./rain";
import { readForecast, freshWeather, type WeatherData } from "./weather-client";
import { matches, defaults } from "./geo";
import { normalizePlace } from "./place-rules";
import { LYON, type Place } from "./types";
const base = {
  category: "transit",
  access: "public",
  lat: LYON.lat,
  lon: LYON.lon,
  wheelchair: null,
} as Place;
describe("Pluie horaire", () => {
  it("ne laisse aucun intervalle sans couleur", () => {
    for (const [mm, color] of [
      [0, "green"],
      [0.09, "green"],
      [0.1, "yellow"],
      [0.9, "yellow"],
      [1, "yellow"],
      [3.99, "yellow"],
      [4, "orange"],
      [7.99, "orange"],
      [8, "red"],
      [20, "red"],
    ] as const)
      expect(rainLevel(mm, 30)).toBe(color);
    expect(rainLevel(8, 29)).toBe("green");
    expect(rainLevel(null, 100)).toBe("unknown");
    expect(rainLevel(0.2, null)).toBe("unknown");
  });
  it("associe cumul et probabilité à la même heure, sans décaler les UV", () => {
    const r = readForecast(
      {
        hourly: {
          time: ["2026-09-09T10:00", "2026-09-09T11:00"],
          rain: [0, 2],
          showers: [0, 2.2],
          precipitation_probability: [10, 40],
          uv_index: [3, 4],
        },
      },
      Date.parse("2026-09-09T10:30:00Z"),
    );
    expect(r).toMatchObject({
      rain_mm: 4.2,
      rain_probability: 40,
      rain_end: "2026-09-09T11:00:00.000Z",
      uv: 3,
    });
    expect(
      freshWeather(
        { ...r, time: "2026-09-09T10:30:00Z" } as WeatherData,
        Date.parse("2026-09-09T11:00:00Z"),
      )?.rain_mm,
    ).toBeNull();
  });
});
describe("Lieux confirmés", () => {
  it("affiche tous les modes et ne conserve que les arrêts confirmés avec PMR", () => {
    for (const mode of ["metro", "tram", "bus"] as const) {
      for (const wheelchair of [true, false, null]) {
        const stop = { ...base, transit_modes: [mode], wheelchair };
        expect(matches(stop, defaults, LYON)).toBe(true);
        expect(matches(stop, { ...defaults, pmr: true }, LYON)).toBe(
          wheelchair === true,
        );
      }
    }
    expect(matches({ ...base, transit_modes: [] }, defaults, LYON)).toBe(true);
    expect(matches({ ...base, transit_modes: [] }, {...defaults,unknownTransit:false}, LYON)).toBe(false);
  });
  it("applique PMR à tous les lieux, même sans transports sélectionnés", () => {
    for (const category of ["playground", "toilet", "food_shop"] as const) {
      for (const wheelchair of [true, false, null]) {
        const place = { ...base, id: "pmr-test", category, wheelchair, baby_food: true };
        const filters = { ...defaults, categories: [category] };
        expect(matches(place, filters, LYON)).toBe(true);
        expect(matches(place, { ...filters, pmr: true }, LYON)).toBe(wheelchair === true);
      }
    }
  });
  it("n'affiche jamais une eau de potabilité inconnue ou négative", () => {
    for (const drinking_water of [null, false])
      expect(
        matches({ ...base, category: "water", drinking_water }, defaults, LYON),
      ).toBe(false);
    expect(
      matches(
        { ...base, category: "water", drinking_water: true },
        defaults,
        LYON,
      ),
    ).toBe(true);
  });
  it("regroupe le change sans inventer de toilettes et limite les observations à leur catégorie", () => {
    const p = normalizePlace({ ...base, category: "changing_table" });
    expect(p).toMatchObject({
      category: "toilet",
      changing_table: true,
      toilets_available: null,
    });
    expect(matches(p, { ...defaults, changing: true }, LYON)).toBe(true);
    expect(
      matches(
        { ...base, category: "playground" },
        { ...defaults, changing: true },
        LYON,
      ),
    ).toBe(true);
  });
});
