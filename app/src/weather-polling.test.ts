import { afterEach, describe, expect, it, vi } from "vitest";
import { Weather } from "./Weather";
import { cachedWeather, fetchWeather } from "./weather-client";
import { LYON } from "./types";

const lifecycle = vi.hoisted(() => ({ effect: null as null | (() => () => void) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => () => void) => { lifecycle.effect = effect; },
  useState: (initial: unknown) => [initial, vi.fn()],
}));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  vi.unstubAllGlobals(); vi.useRealTimers();
});
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { onLine: true });
  let fails = false;
  const fetch = vi.fn(async () => {
    if (fails) throw new Error("Service indisponible");
    return { ok: true, json: async () => ({ current: {
      temperature_2m: 22, wind_speed_10m: 9, weather_code: 2,
      european_aqi: 35, time: new Date().toISOString(),
    } }) };
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, document, fail: (value: boolean) => { fails = value; } };
}
async function populate() {
  await fetchWeather(LYON, new AbortController().signal, () => {});
}
function mount() {
  Weather({ origin: LYON });
  cleanup = lifecycle.effect!();
}
describe("Contrôle périodique de la météo affichée", () => {
  it("rafraîchit après dix minutes quand le cache a déjà cinquante minutes au montage", async () => {
    const { fetch } = setup();
    await populate();
    vi.setSystemTime(Date.now() + 50 * 60_000);
    mount();
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(cachedWeather(LYON)?.weather_time).toBe("2026-09-17T13:00:00.000Z");
    expect(cachedWeather(LYON)?.air_time).toBe("2026-09-17T12:00:00.000Z");
  });
  it("retente cinq minutes après une panne, sans attendre la prochaine heure", async () => {
    const { fetch, fail } = setup();
    await populate();
    vi.setSystemTime(Date.now() + 60 * 60_000);
    fail(true); mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    fail(false);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(cachedWeather(LYON)?.weather_time).toBe("2026-09-17T13:05:00.000Z");
  });
  it("ne télécharge rien dans un onglet masqué, puis vérifie le cache au retour", async () => {
    const { fetch, document } = setup();
    await populate(); mount();
    document.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(70 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
