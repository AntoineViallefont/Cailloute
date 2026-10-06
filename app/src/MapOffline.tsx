import { OfflineAreaPicker, type AreaBounds } from "./OfflineAreaPicker";
import { loadFranceBounds } from "./france-catalog";
import { db } from "./store";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { createPortal } from "react-dom";
import { Download, ChevronRight, WifiOff } from "lucide-react";
import { Modal } from "./Modal";
import {
  tileKey,
  clearMapCache,
  getTile,
  mapDB,
  offlineMap,
  setOfflineMap,
  type Tile,
} from "./map-cache";
export function MapOffline({ satellite, compact = false }: { satellite: boolean; compact?: boolean }) {
  const [area, setArea] = useState<AreaBounds | null>(null);
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(offlineMap());
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [count, setCount] = useState(0),
    [mb, setMB] = useState(0);
  const cancel = useRef(false);
  useEffect(() => {
    const update = () => setOffline(offlineMap());
    window.addEventListener("map-mode", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      cancel.current = true;
      window.removeEventListener("map-mode", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  async function stats() {
    const rows = await mapDB.tiles.toArray();
    setCount(rows.length);
    setMB(rows.reduce((sum, r) => sum + r.blob.size, 0) / 1048576);
  }
  async function download() {
    cancel.current = false;
    setBusy(true);
    setStatus("Préparation…");
    try {
      void navigator.storage?.persist?.().catch(() => false);
      const view = area;
      if (
        !view ||
        ![view.north, view.south, view.west, view.east, view.zoom].every(
          Number.isFinite,
        )
      )
        throw new Error("Affichez d’abord la zone à enregistrer sur la carte.");
      const bounds = L.latLngBounds(
          [view.south, view.west],
          [view.north, view.east],
        ),
        offset = 0;
      const zoom = Math.min(
        Math.round(view.zoom) + offset,
        satellite ? 19 : 18,
      );
      const tiles: Tile[] = [];
      // Chaque niveau retenu couvre toute la zone + une marge ; jamais de zone tronquée.
      let detail = zoom - 2;
      for (
        let z = 0;
        z <= Math.min(zoom + 1, satellite ? 19 : 18);
        z++
      ) {
        const nw = L.CRS.EPSG3857.latLngToPoint(bounds.getNorthWest(), z)
          .divideBy(256)
          .floor();
        const se = L.CRS.EPSG3857.latLngToPoint(bounds.getSouthEast(), z)
          .divideBy(256)
          .floor();
        const level: Tile[] = [];
        for (let y = Math.max(0,nw.y - 1); y <= Math.min(2**z-1,se.y + 1); y++)
          for (let x = Math.max(0,nw.x - 1); x <= Math.min(2**z-1,se.x + 1); x++)
            level.push({ style: satellite ? "aerial" : "plan", z, x, y });
        if (tiles.length + level.length > 512) break;
        tiles.push(...level);
        detail = z;
      }
      if (!tiles.length)
        throw new Error(
          "Zoomez davantage pour enregistrer une zone plus petite.",
        );
      setStatus("Enregistrement des lieux de la zone…");
      await loadFranceBounds(view, () => cancel.current);
      let index = 0,
        completed = 0,
        missing = 0;
      await Promise.all(
        [0, 1].map(async () => {
          while (index < tiles.length && !cancel.current) {
            const tile = tiles[index++];
            const blob = await getTile(tile, true);
            if (!blob || !(await mapDB.tiles.get(tileKey(tile)))) missing++;
            completed++;
            setStatus(
              `${completed} / ${tiles.length} images enregistrées${missing ? ` · ${missing} indisponibles` : ""}`,
            );
            if (missing >= 3) cancel.current = true;
          }
        }),
      );
      if (!cancel.current && !missing) {
        await db.meta.put({key:`offline-area:${satellite ? "aerial" : "plan"}:${Date.now()}`, value:{...view,detail,tiles:tiles.length,saved:new Date().toISOString()}});
      }
      setStatus(
        cancel.current
          ? "Téléchargement interrompu. Les images déjà enregistrées restent disponibles."
          : `Carte et lieux enregistrés${missing ? " partiellement" : ""} · détail jusqu’au zoom ${detail - offset}.`,
      );
      window.dispatchEvent(new Event("map-mode"));
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
      await stats();
    }
  }
  return (
    <>
      <button
        className={compact ? "map-offline floating" : "setting-row"}
        aria-label={offline ? "Hors connexion : gérer les zones" : "Télécharger une zone hors connexion"}
        onClick={() => {
          setOpen(true);
          void stats();
        }}
      >
        <span className="setting-label">
          {offline ? <WifiOff size={19} /> : <Download size={19} />} {compact ? (offline ? "Hors connexion" : "Hors ligne") : "Cartes et lieux hors ligne"}
        </span>
        {!compact && <ChevronRight size={18} />}
      </button>
      {open &&
        createPortal(
          <Modal title="Cartes et lieux hors ligne" onClose={() => setOpen(false)}>
            <p>
              Les cartes consultées sont conservées sur cet appareil.
              Enregistrez une zone pour la garder pendant vos sorties.
            </p>
            <p className="muted">
              Déplacez et zoomez la carte : le rectangle bleu définit la zone. Fond : {satellite ? "Satellite" : "Plan"}.
            </p>
            {!busy && <OfflineAreaPicker satellite={satellite} onChange={setArea}/>}
            <label className="offline-switch">
              <input
                type="checkbox"
                checked={offline}
                disabled={busy || !navigator.onLine}
                onChange={(e) => {
                  setOfflineMap(e.target.checked);
                  setOffline(e.target.checked);
                }}
              />{" "}
              Mode hors connexion
            </label>
            <p className="muted">
              {count} images ·{" "}
              {mb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo
            </p>
            <button
              className="primary"
              disabled={busy || offline || !area}
              onClick={() => void download()}
            >
              <Download size={18} /> Télécharger la carte et les lieux
            </button>
            {busy && (
              <button
                className="secondary"
                onClick={() => {
                  cancel.current = true;
                }}
              >
                Arrêter
              </button>
            )}
            {status && <p role="status">{status}</p>}
            <small>
              Le téléchargement conserve le fond actuellement affiché et
              tous les niveaux de vue d’ensemble et plusieurs niveaux détaillés, ainsi que les lieux du catalogue. Les avis et photos déjà consultés restent disponibles ; les autres nécessitent Internet. Hors de cette zone, la carte peut être
              moins détaillée ou vide.
            </small>
            <button
              className="text-button"
              disabled={busy || !count}
              onClick={async () => {
                setBusy(true);
                try {
                  await clearMapCache();
                  await stats();
                  setStatus("Cartes enregistrées effacées.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Effacer les cartes enregistrées
            </button>
          </Modal>,
          document.body,
        )}
    </>
  );
}
