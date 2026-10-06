import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { offlineMap, setOfflineMap } from "./map-cache";

export function ConnectionStatus() {
  const [offline, setOffline] = useState(offlineMap);
  useEffect(() => {
    const update = () => setOffline(offlineMap());
    const events = ["online", "offline", "map-mode"];
    events.forEach(event => window.addEventListener(event, update));
    return () => events.forEach(event => window.removeEventListener(event, update));
  }, []);
  const label = offline ? "Hors ligne" : "En ligne";
  return <button type="button" className={`connection-status ${offline ? "is-offline" : "is-online"}`} aria-pressed={offline} aria-label={offline ? "Désactiver le mode hors connexion" : "Activer le mode hors connexion"} title={label} onClick={() => setOfflineMap(!offline)}>
    {offline ? <WifiOff size={20} aria-hidden="true" /> : <Wifi size={20} aria-hidden="true" />}
  </button>;
}
