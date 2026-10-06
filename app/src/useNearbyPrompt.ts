import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { canSuggest, claimSuggestion, isImmediatelyNearby, nearbySettingsEvent, type LivePosition } from "./nearby-prompt";
import { db, user } from "./store";
import type { Place } from "./types";

export function useNearbyPrompt(place: Place, enabled: boolean) {
  const [visible, setVisible] = useState(false);
  const claimed = useRef(false);
  const ids = (place.merged_members || [place]).map(p => p.id).sort().join("|");
  useEffect(() => {
    if (!enabled || claimed.current) return;
    const members = ids.split("|");
    let stopped = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nativeWatch: string | undefined;
    let webWatch: number | undefined;
    let checking = false;
    const clear = () => {
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
      if (nativeWatch !== undefined) {
        void Geolocation.clearWatch({id: nativeWatch}).catch(() => {});
        nativeWatch = undefined;
      }
      if (webWatch !== undefined) { navigator.geolocation.clearWatch(webWatch); webWatch = undefined; }
    };
    const eligible = async () => {
      if (!canSuggest(members)) return false;
      // Les contributions antérieures à ce réglage sont aussi prises en compte.
      if ((await db.personal.bulkGet(members)).some(Boolean)) return false;
      const queue = await db.queue.toArray();
      if (queue.some(p => p.owner === user?.id && members.includes(p.operation.place_id))) return false;
      return true;
    };
    const active = (version: number) => !stopped && !claimed.current && version === generation && document.visibilityState === "visible";
    const observe = async (position: LivePosition, version: number) => {
      if (!active(version) || checking || !isImmediatelyNearby(place, position)) return;
      checking = true;
      try {
        if (!(await eligible()) || !active(version) || !isImmediatelyNearby(place, position)) return;
        if (!claimSuggestion(members)) return;
        claimed.current = true;
        setVisible(true);
        clear();
      } catch { /* En cas de doute, ne pas solliciter. */ }
      finally { checking = false; }
    };
    const start = async (version: number) => {
      try {
        if (!(await eligible()) || !active(version)) return;
        if (Capacitor.isNativePlatform()) {
          const permission = await Geolocation.checkPermissions();
          if (!active(version) || permission.location !== "granted") return;
          const id = await Geolocation.watchPosition({enableHighAccuracy: true, maximumAge: 30000, timeout: 15000}, p => {
            if (p) void observe({lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp}, version);
          });
          if (!active(version)) void Geolocation.clearWatch({id}).catch(() => {});
          else nativeWatch = id;
        } else if (navigator.permissions && navigator.geolocation) {
          const permission = await navigator.permissions.query({name: "geolocation"});
          if (!active(version) || permission.state !== "granted") return;
          webWatch = navigator.geolocation.watchPosition(p => void observe({lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp}, version), () => {}, {enableHighAccuracy: true, maximumAge: 30000, timeout: 15000});
        }
      } catch { /* La consultation reste normale sans GPS disponible. */ }
    };
    const schedule = () => {
      generation += 1;
      clear();
      if (!canSuggest(members)) setVisible(false);
      if (stopped || claimed.current || document.visibilityState !== "visible" || !canSuggest(members)) return;
      const version = generation;
      // Cinq secondes de consultation visible, sans autre dialogue ni modification.
      timer = setTimeout(() => void start(version), 5000);
    };
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener(nearbySettingsEvent, schedule);
    window.addEventListener("storage", schedule);
    schedule();
    return () => {
      stopped = true;
      generation += 1;
      clear();
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener(nearbySettingsEvent, schedule);
      window.removeEventListener("storage", schedule);
    };
  }, [place.id, place.lat, place.lon, ids, enabled]);
  return { visible, dismiss: () => setVisible(false) };
}
