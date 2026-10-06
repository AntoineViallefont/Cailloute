import type { PhotoMask } from "./photo-masks";
export function detectionAreas(width: number, height: number): PhotoMask[] {
  const areas: PhotoMask[] = [{ x: 0, y: 0, width: 1, height: 1 }];
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const w = width * scale, h = height * scale;
  if (w <= 640 && h <= 640) return areas;
  // Vue complète et au plus quatre fenêtres se recouvrant : coût borné sur téléphone.
  const tw = Math.min(1, 640 / w), th = Math.min(1, 640 / h);
  for (const y of th === 1 ? [0] : [0, 1 - th])
    for (const x of tw === 1 ? [0] : [0, 1 - tw])
      areas.push({ x, y, width: tw, height: th });
  return areas;
}
