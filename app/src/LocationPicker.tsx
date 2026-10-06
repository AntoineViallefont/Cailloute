import { useState, useEffect, useRef } from "react";
import { MapPin, Layers } from "lucide-react";
import { MapContainer, ScaleControl, useMapEvents } from "./leaflet-react";
import { Modal } from "./Modal";
import { MapLayers } from "./MapLayers";

type Position = { lat: number; lon: number };
function PositionEvents({
  onMove,
  initialPosition,
}: {
  onMove: (position: Position) => void;
  initialPosition: Position;
}) {
  const lastPosition = useRef(initialPosition);
  const resizing = useRef(false);
  const map = useMapEvents({
    click: (event) => map.panTo(event.latlng, { animate: false }),
    moveend: () => {
      if (resizing.current) return;
      const { lat, lng } = map.getCenter();
      lastPosition.current = { lat, lon: lng };
      onMove(lastPosition.current);
    },
  });
  useEffect(() => {
    const resize = () => {
      resizing.current = true;
      map.invalidateSize({ pan: false });
      map.setView(
        [lastPosition.current.lat, lastPosition.current.lon],
        map.getZoom(),
        { animate: false },
      );
      resizing.current = false;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(map.getContainer());
    resize();
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export function LocationPicker({
  position,
  aerial,
  onConfirm,
  onCancel,
}: {
  position: Position;
  aerial: boolean;
  onConfirm: (position: Position) => void;
  onCancel: () => void;
}) {
  const [point, setPoint] = useState(position);
  const [satellite, setSatellite] = useState(aerial);
  const [mapStatus, setMapStatus] = useState("loading");
  return (
    <Modal title="Positionner un point" onClose={onCancel} wide>
      <p className="muted">
        Déplacez la carte ou touchez l’emplacement souhaité.
      </p>
      <div className={"location-picker " + (satellite ? "aerial" : "street")}>
        <MapContainer
          center={[position.lat, position.lon]}
          zoom={18}
          maxZoom={20}
          zoomControl={false}
          fadeAnimation={false}
          attributionControl={false}
          className="location-picker-map"
        >
          <MapLayers
            satellite={satellite}
            events={{
              tileload: () => setMapStatus("ready"),
              tileerror: () =>
                setMapStatus((state) => (state === "ready" ? state : "error")),
            }}
          />

          <ScaleControl position="bottomleft" imperial={false} />
          <PositionEvents onMove={setPoint} initialPosition={position} />
        </MapContainer>
        {mapStatus !== "ready" && (
          <p className="location-picker-status" role="status">
            {mapStatus === "loading"
              ? "Chargement de la carte…"
              : "Fond de carte indisponible. Vérifiez la connexion."}
          </p>
        )}
        <button
          type="button"
          className="floating map-layers picker-layers"
          aria-label={
            satellite ? "Afficher la carte" : "Afficher la vue satellite"
          }
          onClick={() => {
            setSatellite((value) => !value);
            setMapStatus("loading");
          }}
        >
          <Layers size={22} />
        </button>
        <MapPin className="location-picker-pin" size={38} aria-hidden="true" />
      </div>
      <div className="step-actions location-picker-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onConfirm(point)}
        >
          Valider la position
        </button>
      </div>
    </Modal>
  );
}
