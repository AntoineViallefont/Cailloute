import { mapPainted, mapLoading, launchRevealed } from "./startup";
import { useEffect } from "react";
import { useMap } from "./leaflet-react";
import L from "leaflet";
import { paintTile, retryMissingTiles, offlineMap, type Tile } from "./map-cache";

export function MapLayers({
  satellite,
  events,
}: {
  satellite: boolean;
  events?: L.LeafletEventHandlerFnMap;
}) {
  const map = useMap();
  useEffect(() => {
    const element = map.getContainer();
    element.classList.toggle("aerial", satellite);
    element.classList.toggle("street", !satellite);
    const tiles=new Map<HTMLCanvasElement,Tile>();
    const refreshing=new Set<HTMLCanvasElement>();
    function makeLayer(detailed: boolean) {
      const offset = detailed ? 0 : -3;
      class CachedLayer extends L.GridLayer {
        public createTile(coords: L.Coords, done: L.DoneCallback) {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const tile={style:satellite ? "aerial" as const : "plan" as const,z:coords.z+offset,x:coords.x,y:coords.y};
          tiles.set(canvas,tile);
          let completed = false;
          const ready = (error?: Error) => {
            if (completed) return;
            completed = true;
            done(error, canvas);
          };
          void paintTile(
            canvas,
            {
              style: satellite ? "aerial" : "plan",
              z: coords.z + offset,
              x: coords.x,
              y: coords.y,
            },
            () => { if (launchRevealed()) ready(); },
            () => canvas.dataset.retired !== "true",
          )
            .then((ok) =>
              {
                canvas.classList.toggle("tile-unavailable", !ok);
                canvas.title = ok ? "" : "Zone non enregistrée sur cet appareil";
                ready(ok ? undefined : new Error("Zone non enregistrée"));
              },
            )
            .catch(() => ready(new Error("Carte indisponible")));
          return canvas;
        }
      }
      const layer = new CachedLayer({
        tileSize: 256 / 2 ** offset,
        maxNativeZoom: (satellite ? 19 : 18) - offset,
        maxZoom: 22,
        minZoom: detailed ? 0 : 3,
        // Conserve les images adjacentes et recharge pendant le déplacement.
        keepBuffer: detailed ? 3 : 2,
        updateWhenIdle: false,
        updateInterval: 120,
        updateWhenZooming: true,
        zIndex: detailed ? 2 : 1,
      });
      layer.on("tileunload", (e) => {
        const canvas=(e as L.TileEvent).tile as unknown as HTMLCanvasElement;
        canvas.dataset.retired = "true";tiles.delete(canvas);
      });
      layer.on("loading", () => mapLoading(layer));
      layer.on("load", () => mapPainted(layer));
      if (events && detailed) layer.on(events);
      return layer;
    }
    // Un fond couvrant de grandes zones arrive avant les nombreuses tuiles détaillées.
    // Même source et même cache hors ligne, sans baisse de définition finale.
    const layers = [makeLayer(false), makeLayer(true)];
    layers.forEach((layer) => layer.addTo(map));
    const redraw = () => {
      if(offlineMap())return;
      retryMissingTiles();
      for(const [canvas,tile] of tiles){
        if(refreshing.has(canvas) || (!canvas.classList.contains("tile-unavailable") && canvas.dataset.preview!=="true"))continue;
        refreshing.add(canvas);
        void paintTile(canvas,tile,undefined,()=>canvas.dataset.retired!=="true").then(ok=>{
          if(canvas.dataset.retired==="true")return;
          canvas.classList.toggle("tile-unavailable",!ok);
          canvas.title=ok?"":"Zone non enregistrée sur cet appareil";
        }).catch(()=>{}).finally(()=>refreshing.delete(canvas));
      }
    };
    window.addEventListener("map-mode", redraw);
    window.addEventListener("online", redraw);
    return () => {
      window.removeEventListener("map-mode", redraw);
      window.removeEventListener("online", redraw);
      layers.forEach((layer) => { layer.remove(); mapPainted(layer); });
    };
  }, [map, satellite]);
  return null;
}
