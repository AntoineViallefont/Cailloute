import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchWeather,
  weatherKey,
  cachedWeather,
  WEATHER_REFRESH_MS,
  AIR_REFRESH_MS,
  freshWeather,
  readForecast,
  utcTime,
  isDaylight,
  type WeatherData,
} from "./weather-client";
import { LYON } from "./types";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Météo indépendante du serveur local", () => {
  it("associe les UV à leur heure UTC, même autour de minuit en France", () => {
    const result = readForecast(
      {
        current: {
          temperature_2m: 21,
          wind_speed_10m: 5,
          weather_code: 0,
          time: "2026-09-08T22:15",
        },
        hourly: {
          time: ["2026-09-08T21:00", "2026-09-08T22:00", "2026-09-08T23:00"],
          uv_index: [1, 0, 0],
        },
      },
      Date.parse("2026-09-09T00:20:00+02:00"),
    );
    expect(result.uv).toBe(0);
    expect(result.weather_time).toBe("2026-09-08T22:15:00.000Z");
    expect(utcTime("absent")).toBeUndefined();
  });
  it("grise uniquement la mesure périmée, sans afficher une ancienne valeur comme actuelle", () => {
    const now = Date.parse("2026-09-09T12:00:00Z");
    const data: WeatherData = {
      temperature: 21,
      wind: 5,
      uv: 3,
      aqi: 30,
      code: 1,
      time: new Date(now).toISOString(),
      weather_time: "2026-09-09T09:00:00Z",
      air_time: "2026-09-09T12:00:00Z",
      sources: "test",
      errors: [],
    };
    expect(freshWeather(data, now)).toMatchObject({
      temperature: null,
      uv: null,
      wind: null,
      aqi: 30,
    });
  });
  it("affiche la météo même quand le service de qualité de l’air échoue", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    const fetch = vi.fn(async (url: string) => {
      if (url.includes("air-quality")) throw new Error("Service indisponible");
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 22,
            wind_speed_10m: 9,
            weather_code: 2,
            time: new Date().toISOString(),
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetch);
    const updates: WeatherData[] = [];
    await fetchWeather(LYON, new AbortController().signal, (d) =>
      updates.push(d),
    );
    expect(updates.at(-1)).toMatchObject({
      temperature: 22,
      wind: 9,
      aqi: null,
    });
    expect(
      fetch.mock.calls.every(
        ([url]) => url.startsWith("https://") && !url.includes("127.0.0.1"),
      ),
    ).toBe(true);
    expect(updates.at(-1)?.errors).toHaveLength(1);
  });
});
it('lit les horaires UTC du lieu et suit le lever/coucher sans appel réseau',()=>{
 const parsed=readForecast({current:{time:'2026-10-03T16:45',is_day:1},daily:{time:['2026-10-03','2026-10-04'],sunrise:['2026-10-03T05:45','2026-10-04T05:46'],sunset:['2026-10-03T17:10','2026-10-04T17:08']}});
 const data={...parsed,time:'2026-10-03T16:45:00Z'} as WeatherData;
 expect(data.solar_days).toHaveLength(2);expect(data.is_day).toBe(true);
 expect(isDaylight(data,Date.parse('2026-10-03T17:09:59Z'))).toBe(true);
 expect(isDaylight(data,Date.parse('2026-10-03T17:10:00Z'))).toBe(false);
 expect(isDaylight(data,Date.parse('2026-10-04T05:46:00Z'))).toBe(true);
});
it('ne déduit pas le jour de l’heure du téléphone ou d’un ancien indicateur',()=>{
 const data={is_day:true,time:'2026-10-03T12:00:00Z'} as WeatherData;
 expect(isDaylight(data,Date.parse('2026-10-03T12:05:00Z'))).toBe(true);
 expect(isDaylight(data,Date.parse('2026-10-03T20:00:00Z'))).toBeNull();
 expect(isDaylight({time:'2026-10-03T20:00:00Z'} as WeatherData,Date.parse('2026-10-03T20:00:00Z'))).toBeNull();
});

function weatherMock() {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  const fetch = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => ({ current: { temperature_2m: 22, wind_speed_10m: 9, weather_code: 2, european_aqi: 35, time: new Date().toISOString() } }),
  }));
  vi.stubGlobal("fetch", fetch);
  return { fetch, storage };
}
const refresh = (origin = LYON) => fetchWeather(origin, new AbortController().signal, () => {});
describe("Budget météo local", () => {
  it("mutualise les appels en cours et ne redemande rien au retour sur une même zone", async () => {
    const { fetch } = weatherMock();
    await Promise.all([refresh(), refresh(), refresh()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    await refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cachedWeather(LYON)?.temperature).toBe(22);
  });
  it("rafraîchit la météo après 1 h et l’air après 3 h indépendamment", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
    const { fetch } = weatherMock();
    await refresh();
    vi.setSystemTime(Date.now() + WEATHER_REFRESH_MS - 1);
    await refresh(); expect(fetch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 1);
    await refresh(); expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.at(-1)?.[0]).not.toContain("air-quality");
    vi.setSystemTime(Date.now() + AIR_REFRESH_MS - WEATHER_REFRESH_MS);
    await refresh(); expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls.at(-1)?.[0]).toContain("air-quality");
  });
  it("réutilise une cellule voisine, mais télécharge une nouvelle zone", async () => {
    const { fetch } = weatherMock();
    const origin = { ...LYON, lat: 45.751, lon: 4.851 };
    const nearby = { ...LYON, lat: 45.752, lon: 4.852 };
    expect(weatherKey(origin)).toBe(weatherKey(nearby));
    await refresh(origin); await refresh(nearby);
    expect(fetch).toHaveBeenCalledTimes(2);
    await refresh({ ...LYON, lat: 48.85, lon: 2.35 });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("limite les nouvelles tentatives après panne et conserve les dates des anciennes mesures", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));
    const { fetch } = weatherMock();
    await refresh();
    const initial = cachedWeather(LYON)!;
    vi.setSystemTime(Date.now() + AIR_REFRESH_MS);
    fetch.mockRejectedValue(new Error("offline"));
    await refresh(); await refresh();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(cachedWeather(LYON)?.weather_time).toBe(initial.weather_time);
    expect(freshWeather(cachedWeather(LYON))?.temperature).toBeNull();
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await refresh(); expect(fetch).toHaveBeenCalledTimes(6);
  });
  it("garde le cache périmé identifiable, sans le présenter comme actuel", () => {
    const { storage } = weatherMock();
    const old = { temperature: 22, wind: 4, uv: 5, aqi: 35, code: 0, time: new Date(Date.now() - 4 * WEATHER_REFRESH_MS).toISOString(), errors: [], sources: "test" };
    storage.set(weatherKey(LYON), JSON.stringify(old));
    expect(cachedWeather(LYON)?.temperature).toBe(22);
    expect(freshWeather(cachedWeather(LYON))).toBeNull();
  });
  it("un écran fermé n’annule pas le résultat attendu par un autre", async () => {
    const { fetch } = weatherMock();
    const controller = new AbortController();
    const first = vi.fn(), second = vi.fn();
    const a = fetchWeather(LYON, controller.signal, first);
    const b = fetchWeather(LYON, new AbortController().signal, second);
    controller.abort(); await Promise.all([a, b]);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
