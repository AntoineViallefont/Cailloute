/** Intégration React propre à Cailloute, basée sur l'API publique de Leaflet (MIT). */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import L from 'leaflet';

const MapContext = createContext<L.Map | null>(null);
export function useMap(): L.Map {
  const map = useContext(MapContext);
  if (!map) throw new Error('La carte doit être initialisée.');
  return map;
}
export function MapContainer({ children, className, style, ...options }: L.MapOptions & {children?: ReactNode; className?: string; style?: CSSProperties}) {
  const element = useRef<HTMLDivElement>(null);
  const initial = useRef(options);
  const initialClass = useRef(className);
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    const instance = L.map(element.current!, initial.current);
    setMap(instance);
    return () => { instance.remove(); };
  }, []);
  useEffect(() => {
    if (!map) return;
    const node = map.getContainer();
    // Ne pas écraser les classes internes ajoutées par Leaflet.
    for (const c of (initialClass.current || '').split(' ').filter(Boolean)) node.classList.remove(c);
    for (const c of (className || '').split(' ').filter(Boolean)) node.classList.add(c);
    initialClass.current = className;
  }, [map, className]);
  return <div ref={element} className={initialClass.current} style={style}>{map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}</div>;
}
export function useMapEvents(events: L.LeafletEventHandlerFnMap) {
  const map = useMap();
  useEffect(() => { map.on(events); return () => { map.off(events); }; }, [map, events]);
  return map;
}
export function ScaleControl(options: L.Control.ScaleOptions) {
  const map = useMap();
  const {position, metric, imperial, maxWidth, updateWhenIdle} = options;
  useEffect(() => {
    const control = L.control.scale(options).addTo(map);
    return () => { control.remove(); };
  }, [map, position, metric, imperial, maxWidth, updateWhenIdle]);
  return null;
}
export function Marker({position, eventHandlers, ...options}: L.MarkerOptions & {position: L.LatLngExpression; eventHandlers?: L.LeafletEventHandlerFnMap}) {
  const map = useMap();
  const marker = useRef<L.Marker | null>(null);
  useEffect(() => {
    const instance = L.marker(position, options).addTo(map);
    marker.current = instance;
    return () => { instance.remove(); marker.current = null; };
  }, [map]);
  useEffect(() => {
    const instance = marker.current!;
    instance.setLatLng(position);
    if (options.icon) instance.setIcon(options.icon);
    if (options.zIndexOffset !== undefined) instance.setZIndexOffset(options.zIndexOffset);
    const node = instance.getElement();
    if (node) { node.title = options.title || ''; node.setAttribute('alt', options.alt || 'Repère'); }
  }, [position, options.icon, options.zIndexOffset, options.title, options.alt]);
  useEffect(() => {
    const instance = marker.current!;
    if (eventHandlers) instance.on(eventHandlers);
    return () => { if (eventHandlers) instance.off(eventHandlers); };
  }, [eventHandlers]);
  return null;
}
export function CircleMarker({center, radius, pathOptions}: {center: L.LatLngExpression; radius?: number; pathOptions?: L.PathOptions}) {
  const map = useMap(); const layer = useRef<L.CircleMarker | null>(null);
  useEffect(() => { const instance = L.circleMarker(center, {...pathOptions, radius}).addTo(map); layer.current = instance; return () => { instance.remove(); }; }, [map]);
  useEffect(() => { layer.current!.setLatLng(center).setStyle(pathOptions || {}); if (radius !== undefined) layer.current!.setRadius(radius); }, [center, radius, pathOptions]);
  return null;
}
export function Polyline({positions, pathOptions}: {positions: L.LatLngExpression[] | L.LatLngExpression[][]; pathOptions?: L.PathOptions}) {
  const map = useMap(); const layer = useRef<L.Polyline | null>(null);
  useEffect(() => { const instance = L.polyline(positions, pathOptions).addTo(map); layer.current = instance; return () => { instance.remove(); }; }, [map]);
  useEffect(() => { layer.current!.setLatLngs(positions).setStyle(pathOptions || {}); }, [positions, pathOptions]);
  return null;
}
export function Rectangle({bounds, pathOptions, interactive}: {bounds: L.LatLngBoundsExpression; pathOptions?: L.PathOptions; interactive?: boolean}) {
  const map = useMap(); const layer = useRef<L.Rectangle | null>(null);
  useEffect(() => { const instance = L.rectangle(bounds, {...pathOptions, interactive}).addTo(map); layer.current = instance; return () => { instance.remove(); }; }, [map]);
  useEffect(() => { layer.current!.setBounds(bounds).setStyle(pathOptions || {}); }, [bounds, pathOptions]);
  return null;
}
