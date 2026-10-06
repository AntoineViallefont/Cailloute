import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { weatherAdvice } from "./weather-advice";
import { offlineMap } from "./map-cache";
import { useEffect, useState } from "react";
import {
  Cloud,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Sun,
  Moon,
  CloudMoon,
  Wind,
  Leaf,
  CloudFog,
} from "lucide-react";
import {
  cachedWeather,
  fetchWeather,
  freshWeather,
  isDaylight,
  weatherKey,
  type WeatherData,
} from "./weather-client";
export type { WeatherData } from "./weather-client";
import { rainLevel, rainNumber } from "./rain";
import { level } from "./geo";
import type { Origin } from "./types";
function conditions(code: number | null,night=false) {
  if (code === null) return { Icon: Cloud, label: "Indisponible" };
  if (code === 0) return night ? {Icon:Moon,label:"Nuit claire"} : { Icon: Sun, label: "Soleil" };
  if (code < 3) return night ? {Icon:CloudMoon,label:"Peu nuageux"} : { Icon: CloudSun, label: "Éclaircies" };
  if (code === 3) return { Icon: Cloud, label: "Nuageux" };
  if (code < 50) return { Icon: CloudFog, label: "Brouillard" };
  if (code >= 95) return { Icon: CloudLightning, label: "Orage" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { Icon: CloudSnow, label: "Neige" };
  return { Icon: CloudRain, label: "Pluie" };
}
export function Weather({ origin }: { origin: Origin }) {
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [d, setD] = useState<WeatherData | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    let controller: AbortController | null = null;
    setD(cachedWeather(origin));
    const update = () => {
      if (document.visibilityState === "hidden" || offlineMap()) return;
      controller?.abort();
      controller = new AbortController();
      void fetchWeather(origin, controller.signal, data=>setD(previous=>JSON.stringify(previous)===JSON.stringify(data)?previous:data));
    };
    const resume = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    // Vérifier le cache chaque minute ; seuls ses délais 1 h / 3 h autorisent le réseau.
    const timer = setInterval(update, 60000);
    const clock = setInterval(() => tick((n) => n + 1), 60000);
    window.addEventListener("online", update);
    window.addEventListener("weather-refresh", update);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller?.abort();
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("online", update);
      window.removeEventListener("weather-refresh", update);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [weatherKey(origin)]);
  const fresh = freshWeather(d);
  const night=isDaylight(fresh)===false;
  const { Icon, label } = conditions(fresh?.code ?? null,night);
  const uv=night?null:fresh?.uv;
  const weatherAge = d ? Math.max(0, Math.floor((Date.now() - Date.parse(d.weather_time || d.time)) / 60000)) : null;
  const ageLabel = weatherAge === null ? "" : weatherAge < 60 ? `${weatherAge} min` : `${Math.floor(weatherAge / 60)} h`;
  const rain = rainLevel(fresh?.rain_mm, fresh?.rain_probability);
  const temperature = level("temperature", fresh?.temperature);
  const weatherLevel =
    temperature === "red" || rain === "red"
      ? "red"
      : temperature === "orange" || rain === "orange"
        ? "orange"
        : rain === "yellow"
          ? "yellow"
          : temperature;
  const val = (v: number | null | undefined) =>
    v == null ? "—" : Math.round(v);
  return (
    <>
    <section className="weather" role="button" tabIndex={0} aria-label="Météo : ouvrir les conseils de sortie" onClick={() => setAdviceOpen(true)} onKeyDown={e=>{if(e.key==="Enter" || e.key===" "){e.preventDefault();setAdviceOpen(true);}}}>
      <span className={"weather-main " + weatherLevel}>
        <Icon size={31} />
        <span>
          <strong>{val(fresh?.temperature)}°</strong>
          <small title={d ? `Météo : ${d.weather_time || d.time} · Air : ${d.air_time || d.time}` : undefined}>{label}</small>
          {fresh?.rain_mm != null && fresh.rain_mm >= 0.1 && (
            <small className={"rain-mini " + rain}>
              {rainNumber(fresh.rain_mm)} mm/h · {fresh.rain_probability ?? "—"} %
            </small>
          )}
        </span>
      </span>
      <span className={level("wind", fresh?.wind)}>
        <Wind />
        <span>
          <small>Vent</small>
          <b>
            {val(fresh?.wind)} <em>km/h</em>
          </b>
        </span>
      </span>
      <span className={level("uv", uv)} title={night?"UV non affichés la nuit":undefined}>
        <Sun />
        <span>
          <small>UV</small>
          <b>{val(uv)}</b>
        </span>
      </span>
      <span className={level("aqi", fresh?.aqi)}>
        <Leaf />
        <span>
          <small>Air</small>
          <b>
            {fresh?.aqi == null
              ? "—"
              : fresh.aqi <= 40
                ? "Bon"
                : fresh.aqi <= 60
                  ? "Moyen"
                  : "Mauvais"}
          </b>
        </span>
      </span>
    </section>
    {adviceOpen && createPortal(<Modal title="Conseils pour votre sortie" onClose={()=>setAdviceOpen(false)}>
      {ageLabel && <p className="muted">Mise à jour il y a {ageLabel}</p>}
      <ul className="weather-advice">{weatherAdvice(fresh).map(tip=><li key={tip}>{tip}</li>)}</ul>
    </Modal>, document.body)}
    </>
  );
}
