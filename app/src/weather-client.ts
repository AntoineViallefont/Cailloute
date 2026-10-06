import type { Origin } from "./types";
export interface WeatherData {
  is_day?: boolean | null;
  solar_days?: {date:string;sunrise:string;sunset:string}[];
  solar_schema?: 1;
  rain_mm?: number | null;
  rain_probability?: number | null;
  rain_end?: string;
  temperature: number | null;
  wind: number | null;
  uv: number | null;
  aqi: number | null;
  code: number | null;
  time: string;
  weather_time?: string;
  air_time?: string;
  sources: string;
  errors: string[];
  weather_fetched?: number;
  air_fetched?: number;
  weather_attempt?: number;
  air_attempt?: number;
}
const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export function utcTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value.endsWith("Z") ? value : value + "Z");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}
export function readForecast(j: any, now = Date.now()): Partial<WeatherData> {
  const solar_days:NonNullable<WeatherData['solar_days']>=[];
  for(const [i,date]of (j.daily?.time||[]).entries()){
    const sunrise=utcTime(j.daily?.sunrise?.[i]),sunset=utcTime(j.daily?.sunset?.[i]);
    if(typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && sunrise && sunset && Date.parse(sunrise)<Date.parse(sunset))solar_days.push({date,sunrise,sunset});
  }
  const times: string[] = j.hourly?.time || [];
  const hour = times.findIndex((t, i) => {
    const start = Date.parse(utcTime(t) || "");
    const end =
      i + 1 < times.length
        ? Date.parse(utcTime(times[i + 1]) || "")
        : start + 3600000;
    return start <= now && now < end;
  });
  const rainHour = times.findIndex((t) => {
    const end = Date.parse(utcTime(t) || "");
    return end > now && end - 3600000 <= now;
  });
  const rain = number(j.hourly?.rain?.[rainHour]),
    showers = number(j.hourly?.showers?.[rainHour]);
  return {
    solar_schema:1,solar_days,is_day:j.current?.is_day===1?true:j.current?.is_day===0?false:null,
    rain_mm:
      rain === null || showers === null
        ? null
        : Math.round((rain + showers) * 100) / 100,
    rain_probability:
      rainHour < 0
        ? null
        : number(j.hourly?.precipitation_probability?.[rainHour]),
    rain_end: rainHour < 0 ? undefined : utcTime(times[rainHour]),
    temperature: number(j.current?.temperature_2m),
    wind: number(j.current?.wind_speed_10m),
    code: number(j.current?.weather_code),
    uv: hour < 0 ? null : number(j.hourly?.uv_index?.[hour]),
    weather_time: utcTime(j.current?.time),
  };
}
/** Les horaires UTC de la zone permettent de basculer sans nouvel appel réseau. */
export function isDaylight(d:WeatherData|null,now=Date.now()):boolean|null {
  if(!d || !Number.isFinite(now))return null;
  const date=new Date(now).toISOString().slice(0,10),solar=d.solar_days?.find(day=>day.date===date);
  if(solar){
    const rise=Date.parse(solar.sunrise),set=Date.parse(solar.sunset);
    if(Number.isFinite(rise) && Number.isFinite(set) && rise<set)return now>=rise && now<set;
  }
  const time=Date.parse(d.weather_time||d.time),age=now-time;
  return typeof d.is_day==='boolean' && age>=-300000 && age<15*60000 ? d.is_day : null;
}
export function freshWeather(
  d: WeatherData | null,
  now = Date.now(),
): WeatherData | null {
  if (!d) return null;
  const fresh = (time: string | undefined, maxAge: number) => {
    const age = now - Date.parse(time || d.time);
    return age >= -300000 && age < maxAge;
  };
  const w = fresh(d.weather_time, 90 * 60_000),
    a = fresh(d.air_time, 210 * 60_000);
  if (!w && !a) return null;
  return {
    ...d,
    ...(!w ? { temperature: null, wind: null, uv: null, code: null,is_day:null } : {}),
    ...(!w || !d.rain_end || Date.parse(d.rain_end) <= now
      ? { rain_mm: null, rain_probability: null }
      : {}),
    ...(!a ? { aqi: null } : {}),
  };
}
export const WEATHER_REFRESH_MS = 60 * 60_000;
export const AIR_REFRESH_MS = 3 * WEATHER_REFRESH_MS;
const RETRY_MS = 5 * 60_000;
// En France : cellules d’environ 4 × 5,5 km, communes à tous les écrans.
export const weatherZone = (origin: Origin): Origin => ({
  ...origin,
  lat: Math.round(origin.lat / 0.05) * 0.05,
  lon: Math.round(origin.lon / 0.05) * 0.05,
});
export const weatherKey = (origin: Origin) => {
  const zone = weatherZone(origin);
  return `weather:v2:${zone.lat.toFixed(2)}:${zone.lon.toFixed(2)}`;
};
export function cachedWeather(origin: Origin): WeatherData | null {
  try {
    const data = JSON.parse(localStorage.getItem(weatherKey(origin)) || "null");
    return data && typeof data.time === "string" && Array.isArray(data.errors) ? data : null;
  } catch { return null; }
}
function saveWeather(key: string, data: WeatherData) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
const pending = new Map<string, {
  task: Promise<void>;
  subscribers: Set<(data: WeatherData) => void>;
}>();

// Le retour sur l’écran ne relance pas les téléchargements encore valides.
// Une requête commune continue même si l’un des écrans se ferme.
export async function fetchWeather(
  origin: Origin,
  signal: AbortSignal,
  onUpdate: (d: WeatherData) => void,
) {
  if (signal.aborted) return;
  const key = weatherKey(origin);
  const notify = (data: WeatherData) => { if (!signal.aborted) onUpdate({ ...data }); };
  const cached = cachedWeather(origin);
  if (cached) notify(cached);
  const existing = pending.get(key);
  if (existing) {
    existing.subscribers.add(notify);
    try { await existing.task; } finally { existing.subscribers.delete(notify); }
    return;
  }
  const now = Date.now();
  const due = (fetched: number | undefined, attempted: number | undefined, ttl: number) =>
    (!Number.isFinite(fetched) || now < fetched! || now - fetched! >= ttl) &&
    (!Number.isFinite(attempted) || now < attempted! || now - attempted! >= RETRY_MS);
  const weatherDue = due(cached?.solar_schema===1?cached?.weather_fetched:undefined, cached?.weather_attempt, WEATHER_REFRESH_MS);
  const airDue = due(cached?.air_fetched, cached?.air_attempt, AIR_REFRESH_MS);
  if (!weatherDue && !airDue) return;
  let data: WeatherData = {
    temperature: null, wind: null, uv: null, aqi: null, code: null,
    time: new Date(now).toISOString(), sources: "Open-Meteo · CAMS ENSEMBLE", errors: [],
    ...cached,
    ...(weatherDue ? { weather_attempt: now } : {}),
    ...(airDue ? { air_attempt: now } : {}),
  };
  saveWeather(key, data);
  const subscribers = new Set([notify]);
  const zone = weatherZone(origin);
  const params = new URLSearchParams({
    latitude: zone.lat.toFixed(2), longitude: zone.lon.toFixed(2), timezone: "UTC",
  });
  async function request(url: string, parse: (j: any) => Partial<WeatherData>, label: string, kind: "weather" | "air") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      const result = parse(await response.json());
      if (!result[kind === "weather" ? "weather_time" : "air_time"]) throw new Error("Date de mesure absente");
      data = { ...data, ...result, time: new Date().toISOString(),
        [`${kind}_fetched`]: Date.now(), errors: data.errors.filter((error) => error !== label) };
    } catch {
      data = { ...data, errors: [...new Set([...data.errors, label])] };
    } finally { clearTimeout(timer); }
    // Les dates des mesures restent distinctes de la date de téléchargement.
    saveWeather(key, data);
    subscribers.forEach((subscriber) => subscriber(data));
  }
  // Enregistrer la tâche avant de commencer les requêtes, même avec un cache réseau synchrone.
  const task = Promise.resolve().then(async () => {
    await Promise.allSettled([
      ...(weatherDue ? [request(
        `https://api.open-meteo.com/v1/forecast?${params}&current=temperature_2m,weather_code,wind_speed_10m,is_day&hourly=uv_index,rain,showers,precipitation_probability&daily=sunrise,sunset&forecast_days=2`,
        readForecast, "Météo indisponible. Vérifiez la connexion et réessayez.", "weather",
      )] : []),
      ...(airDue ? [request(
        `https://air-quality-api.open-meteo.com/v1/air-quality?${params}&current=european_aqi`,
        (j) => ({ aqi: number(j.current?.european_aqi), air_time: utcTime(j.current?.time) }),
        "Qualité de l’air indisponible.", "air",
      )] : []),
    ]);
  }).finally(() => pending.delete(key));
  pending.set(key, { task, subscribers });
  await task;
}
