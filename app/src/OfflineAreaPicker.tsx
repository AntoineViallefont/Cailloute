import { useEffect, useState } from "react";
import { MapContainer, Rectangle, useMapEvents } from "./leaflet-react";
import { MapLayers } from "./MapLayers";
export type AreaBounds = { north: number; south: number; west: number; east: number; zoom: number };
function Frame({ onChange }: { onChange: (area: AreaBounds) => void }) {
  const [bounds, setBounds] = useState<[[number,number],[number,number]] | null>(null);
  const update = () => {
    const size = map.getSize();
    const nw = map.containerPointToLatLng([size.x * .12, size.y * .12]);
    const se = map.containerPointToLatLng([size.x * .88, size.y * .88]);
    setBounds([[nw.lat,nw.lng],[se.lat,se.lng]]);
    onChange({ north:nw.lat, south:se.lat, west:nw.lng, east:se.lng, zoom:map.getZoom() });
  };
  const map = useMapEvents({ moveend:update, resize:update });
  useEffect(() => { map.invalidateSize(); update(); }, [map]);
  return bounds ? <Rectangle bounds={bounds} interactive={false} pathOptions={{color:"#1767de",weight:3,fillOpacity:.08}} /> : null;
}
export function OfflineAreaPicker({ satellite, onChange }: {satellite:boolean;onChange:(area:AreaBounds)=>void}) {
  const [initial] = useState(() => {
    try { const v=JSON.parse(localStorage.getItem("mapViewport")||"null");
      if(v && [v.north,v.south,v.west,v.east,v.zoom].every(Number.isFinite)) return {lat:(v.north+v.south)/2,lon:(v.west+v.east)/2,zoom:v.zoom};
    } catch { /* Centre par défaut. */ }
    return {lat:45.7578,lon:4.832,zoom:14};
  });
  return <div className="offline-area-picker" aria-label="Zone à télécharger : déplacez et zoomez la carte pour régler le rectangle">
    <MapContainer center={[initial.lat,initial.lon]} zoom={Math.min(18,initial.zoom)} minZoom={8} maxZoom={18} maxBounds={[[40,-6],[52,11]]} attributionControl={false}>
      <MapLayers satellite={satellite}/><Frame onChange={onChange}/>
    </MapContainer>
  </div>;
}
