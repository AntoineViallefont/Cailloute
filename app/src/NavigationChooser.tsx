import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  Footprints,
  Bike,
  TrainFront,
  Car,
  ChevronRight,
  ArrowLeft,
  MapPinned,
} from "lucide-react";
import { Modal } from "./Modal";
import { directions } from "./geo";
import {
  needsPmrPlanner,
  travelModes,
  tclDestination,
} from "./navigation-policy";
import type { Place, Origin } from "./types";
interface NavApp {
  id: string;
  label: string;
  icon?: string;
}
const bridge = registerPlugin<{
  apps(options: { mode: string }): Promise<{ apps: NavApp[] }>;
  open(options: {
    id: string;
    lat: number;
    lon: number;
    name: string;
    mode: string;
    googleUrl: string;
  }): Promise<void>;
}>("CaillouteNavigation");
const modes = [
  { id: "walking", label: "À pied", Icon: Footprints },
  { id: "bicycling", label: "À vélo", Icon: Bike },
  { id: "transit", label: "Transports", Icon: TrainFront },
  { id: "driving", label: "En voiture", Icon: Car },
];
const prefKey = (mode: string) => "navigation:" + mode;
export function resetNavigation() {
  modes.forEach((m) => localStorage.removeItem(prefKey(m.id)));
}
function preference(mode: string): NavApp | null {
  try {
    return JSON.parse(localStorage.getItem(prefKey(mode)) || "null");
  } catch {
    return null;
  }
}
export function NavigationChooser({
  place,
  origin,
  pmr = false,
  onClose,
}: {
  place: Place;
  origin: Origin;
  pmr?: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState("");
  const [pmrPlanner, setPmrPlanner] = useState(false);
  const [copied, setCopied] = useState(false);
  const visibleModes = modes.filter((m) => travelModes(pmr).includes(m.id));
  const [apps, setApps] = useState<NavApp[]>([]);
  const [selected, setSelected] = useState<NavApp | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [, render] = useState(0);
  async function launch(m: string, app: NavApp, remember = false) {
    setError("");
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform())
        await bridge.open({
          id: app.id,
          lat: place.lat,
          lon: place.lon,
          name: place.name,
          mode: m,
          googleUrl: directions(place, m, origin),
        });
      else {
        let url = directions(place, m, origin);
        if (app.id === "waze")
          url = `https://waze.com/ul?ll=${place.lat},${place.lon}&navigate=yes`;
        if (app.id === "apple")
          url = `https://maps.apple.com/directions?destination=${place.lat},${place.lon}&mode=${({ walking: "walking", bicycling: "cycling", transit: "transit", driving: "driving" } as Record<string, string>)[m]}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
      if (remember)
        localStorage.setItem(
          prefKey(m),
          JSON.stringify({ id: app.id, label: app.label }),
        );
      onClose();
    } catch {
      localStorage.removeItem(prefKey(m));
      setError("Application inaccessible. Choisissez une autre application.");
      if (!pmr) await choose(m, true);
    } finally {
      setBusy(false);
    }
  }
  async function choose(m: string, force = false) {
    if (needsPmrPlanner(pmr, m)) {
      setPmrPlanner(true);
      return;
    }
    if (pmr) { await launch(m, { id: Capacitor.isNativePlatform() ? "browser" : "google", label: "Google Maps" }); return; }
    const saved = preference(m);
    if (saved && !force) {
      await launch(m, saved);
      return;
    }
    setMode(m);
    setSelected(null);
    setApps([]);
    setLoadingApps(true);
    try {
      const available = await availableApps(m);
      setApps(available);
    } catch {
      setError("Impossible de lire les applications disponibles.");
    } finally {
      setLoadingApps(false);
    }
  }
  return (
    <Modal
      title={
        pmrPlanner
          ? "Transports PMR"
          : mode
            ? "Ouvrir avec…"
            : pmr
              ? "Itinéraire PMR"
              : "Comment y aller ?"
      }
      onClose={onClose}
    >
      {pmrPlanner ? (
        <div className="pmr-planner">
          <button
            className="text-button"
            onClick={() => {
              setPmrPlanner(false);
              setError("");
            }}
          >
            <ArrowLeft size={16} /> Modes de déplacement
          </button>
          <p>
            Activez l’option « Accessible en fauteuil roulant » dans les options.
          </p>
          <section className="pmr-destination">
            <strong>Destination</strong>
            <span>{tclDestination(place)}</span>
            <button
              className="text-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(tclDestination(place))
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError(
                      "Copie impossible. Vous pouvez sélectionner l’adresse ci-dessus.",
                    ),
                  );
              }}
            >
              {copied ? "Adresse copiée" : "Copier la destination"}
            </button>
          </section>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void launch("transit", {
                id: Capacitor.isNativePlatform() ? "browser" : "google",
                label: "Google Maps",
              })
            }
          >
            Ouvrir Google Maps
          </button>
        </div>
      ) : !mode ? (
        <>
          <div className="travel-modes">
            {visibleModes.map(({ id, label, Icon }) => (
              <button
                disabled={busy}
                key={id}
                className="travel"
                onClick={() => void choose(id)}
              >
                <Icon />
                <span>
                  {pmr && id === "transit" ? "Transports PMR" : label}
                  {!needsPmrPlanner(pmr, id) && preference(id) && (
                    <small style={{ display: "block" }}>
                      {preference(id)?.label}
                    </small>
                  )}
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
          {visibleModes.some(
            (m) => !needsPmrPlanner(pmr, m.id) && preference(m.id),
          ) && (
            <button
              className="text-button navigation-reset"
              onClick={() => {
                resetNavigation();
                render((n) => n + 1);
              }}
            >
              Changer l’application de guidage
            </button>
          )}
        </>
      ) : (
        <>
          <button
            className="text-button"
            onClick={() => {
              setMode("");
              setError("");
            }}
          >
            <ArrowLeft size={16} />
            {modes.find((m) => m.id === mode)?.label}
          </button>
          <div className="navigation-apps">
            {apps.map((app) => (
              <button
                key={app.id}
                aria-pressed={selected?.id === app.id}
                onClick={() => setSelected(app)}
              >
                <AppIcon app={app} />
                <span>{app.label}</span>
              </button>
            ))}
          </div>
          {loadingApps && (
            <p className="muted" role="status">
              Recherche des applications…
            </p>
          )}
          {!loadingApps && !apps.length && (
            <p className="muted">
              Aucune application cartographique compatible installée.
            </p>
          )}
          <p className="muted">
            « Toujours » mémorise votre choix pour ce mode de déplacement.
            Modifiable dans Profil.
          </p>
          {Capacitor.isNativePlatform() &&
            selected &&
            !["com.google.android.apps.maps", "com.waze", "browser"].includes(
              selected.id,
            ) && (
              <p className="muted">
                La destination sera transmise. Confirmez le mode et lancez
                l’itinéraire dans cette application.
              </p>
            )}
          <div className="navigation-actions">
            <button
              className="secondary"
              disabled={!selected || busy}
              onClick={() => selected && void launch(mode, selected)}
            >
              Une fois
            </button>
            <button
              className="primary"
              disabled={!selected || busy}
              onClick={() => selected && void launch(mode, selected, true)}
            >
              Toujours
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

async function availableApps(mode: string): Promise<NavApp[]> {
  return Capacitor.isNativePlatform()
    ? (await bridge.apps({ mode })).apps
    : [
        { id: "google", label: "Google Maps" },
        { id: "apple", label: "Plans Apple" },
        ...(mode === "driving" ? [{ id: "waze", label: "Waze" }] : []),
      ];
}
function AppIcon({ app }: { app: NavApp }) {
  return app.icon ? (
    <img className="navigation-app-icon" src={app.icon} alt="" />
  ) : (
    <MapPinned className="navigation-app-icon" aria-hidden="true" />
  );
}
export function NavigationSettings({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState("");
  const [apps, setApps] = useState<NavApp[]>([]);
  const [selected, setSelected] = useState<NavApp | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!mode) return;
    let active = true;
    setLoading(true);
    setError("");
    setApps([]);
    setSelected(null);
    availableApps(mode)
      .then((items) => {
        if (!active) return;
        setApps(items);
        setSelected(
          items.find((app) => app.id === preference(mode)?.id) || null,
        );
      })
      .catch(() => {
        if (active) setError("Applications indisponibles.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  return (
    <Modal title="Applications d’itinéraire" onClose={onClose}>
      {!mode ? (
        <div className="travel-modes">
          {modes.map(({ id, label, Icon }) => (
            <button key={id} className="travel" onClick={() => setMode(id)}>
              <Icon />
              <span>
                {label}
                <small className="navigation-preference">
                  {preference(id)?.label || "Demander à chaque fois"}
                </small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      ) : (
        <>
          <button className="text-button" onClick={() => setMode("")}>
            <ArrowLeft size={16} /> {modes.find((m) => m.id === mode)?.label}
          </button>
          <div className="navigation-apps">
            {apps.map((app) => (
              <button
                key={app.id}
                aria-pressed={selected?.id === app.id}
                onClick={() => setSelected(app)}
              >
                <AppIcon app={app} />
                <span>{app.label}</span>
              </button>
            ))}
          </div>
          {loading && <p role="status">Recherche des applications…</p>}
          {error && <p className="error">{error}</p>}
          <div className="navigation-actions">
            <button
              className="secondary"
              onClick={() => {
                localStorage.removeItem(prefKey(mode));
                setMode("");
              }}
            >
              Demander à chaque fois
            </button>
            <button
              className="primary"
              disabled={!selected || loading}
              onClick={() => {
                if (selected)
                  localStorage.setItem(
                    prefKey(mode),
                    JSON.stringify({ id: selected.id, label: selected.label }),
                  );
                setMode("");
              }}
            >
              Toujours
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
