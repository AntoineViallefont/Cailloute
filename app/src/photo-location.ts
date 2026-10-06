export type PhotoPosition = {
  lat: number;
  lon: number;
  source: "exif" | "capture";
};
export function validPosition(
  p: { lat: number; lon: number } | undefined | null,
): p is { lat: number; lon: number } {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}
export async function readPhotoPosition(
  blob: Blob,
): Promise<PhotoPosition | undefined> {
  try {
    const { gps } = await import("exifr");
    const point = await gps(typeof FileReader === "undefined" ? await blob.arrayBuffer() : blob);
    const result = point && {
      lat: point.latitude,
      lon: point.longitude,
      source: "exif" as const,
    };
    return validPosition(result) ? result : undefined;
  } catch {
    return undefined;
  }
}
function coordinate(value: unknown): number {
  if (typeof value === "number") return value;
  const parts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/).filter(Boolean)
      : [];
  const numbers = parts.map((part) => {
    if (typeof part === "number") return part;
    const [a, b] = String(part).split("/").map(Number);
    return b === undefined ? a : b === 0 ? NaN : a / b;
  });
  return numbers.length === 1
    ? numbers[0]
    : numbers.length === 3
      ? numbers[0] + numbers[1] / 60 + numbers[2] / 3600
      : NaN;
}
export function nativePhotoPosition(exif: unknown): PhotoPosition | undefined {
  try {
    const parsed = typeof exif === "string" ? JSON.parse(exif) : exif;
    if (!parsed || typeof parsed !== "object") return;
    const data = parsed["{GPS}"] || parsed;
    const latRef = data.GPSLatitudeRef ?? data.LatitudeRef;
    const lonRef = data.GPSLongitudeRef ?? data.LongitudeRef;
    if (!["N", "S"].includes(latRef) || !["E", "W"].includes(lonRef)) return;
    const result: PhotoPosition = {
      lat:
        Math.abs(coordinate(data.GPSLatitude ?? data.Latitude)) *
        (latRef === "S" ? -1 : 1),
      lon:
        Math.abs(coordinate(data.GPSLongitude ?? data.Longitude)) *
        (lonRef === "W" ? -1 : 1),
      source: "exif",
    };
    return validPosition(result) ? result : undefined;
  } catch {
    return undefined;
  }
}
// Moyenne à poids égaux sur la sphère, y compris près du méridien ±180°.
export function photoBarycenter(photos: { position?: PhotoPosition }[]) {
  const points = photos
    .map((p) => p.position)
    .filter((p): p is PhotoPosition => validPosition(p));
  if (!points.length) return undefined;
  let x = 0,
    y = 0,
    z = 0;
  for (const p of points) {
    const lat = (p.lat * Math.PI) / 180,
      lon = (p.lon * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  if (Math.hypot(x, y, z) < 1e-10) return undefined;
  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lon: (Math.atan2(y, x) * 180) / Math.PI,
    count: points.length,
  };
}
