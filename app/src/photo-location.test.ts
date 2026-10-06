import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  nativePhotoPosition,
  photoBarycenter,
  readPhotoPosition,
  type PhotoPosition,
} from "./photo-location";
const point = (lat: number, lon: number): { position: PhotoPosition } => ({
  position: { lat, lon, source: "exif" },
});
describe("Emplacement depuis les photos", () => {
  it("lit le GPS du fichier original et ignore les images sans GPS", async () => {
    const fixture = (name: string) =>
      new Blob([
        new Uint8Array(
          readFileSync(new URL(`./test-data/${name}.jpg`, import.meta.url)),
        ),
      ]);
    const a = await readPhotoPosition(fixture("photo-gps-a"));
    const b = await readPhotoPosition(fixture("photo-gps-b"));
    expect(a?.lat).toBeCloseTo(45 + 45 / 60 + 28 / 3600, 8);
    expect(b?.lon).toBeCloseTo(4 + 49 / 60 + 58 / 3600, 8);
    const center = photoBarycenter([{ position: a }, { position: b }, {}]);
    expect(center?.lat).toBeCloseTo(45.75833333, 6);
    expect(center?.lon).toBeCloseTo(4.83222222, 6);
    expect(center?.count).toBe(2);
    expect(await readPhotoPosition(fixture("photo-no-gps"))).toBeUndefined();
    expect(await readPhotoPosition(new Blob(["not a photo"]))).toBeUndefined();
  });
  it("recalcule à poids égaux après retrait et gère le méridien 180°", () => {
    expect(photoBarycenter([point(45, 4)])?.lat).toBeCloseTo(45, 10);
    expect(photoBarycenter([point(0, 179), point(0, -179)])?.lon).toBeCloseTo(
      180,
      8,
    );
    expect(photoBarycenter([point(95, 4), {}, point(NaN, 4)])).toBeUndefined();
    expect(photoBarycenter([point(0, 0), point(0, 180)])).toBeUndefined();
  });
  it("interprète les coordonnées natives et leurs hémisphères", () => {
    expect(
      nativePhotoPosition(
        JSON.stringify({
          GPSLatitude: "45/1,30/1,0/1",
          GPSLongitude: "4/1,15/1,0/1",
          GPSLatitudeRef: "S",
          GPSLongitudeRef: "W",
        }),
      ),
    ).toEqual({ lat: -45.5, lon: -4.25, source: "exif" });
    expect(
      nativePhotoPosition({
        "{GPS}": {
          Latitude: 45.5,
          Longitude: 4.25,
          LatitudeRef: "N",
          LongitudeRef: "E",
        },
      }),
    ).toEqual({ lat: 45.5, lon: 4.25, source: "exif" });
    expect(
      nativePhotoPosition({
        GPSLatitude: "45/0,0/1,0/1",
        GPSLongitude: "4",
        GPSLatitudeRef: "N",
        GPSLongitudeRef: "E",
      }),
    ).toBeUndefined();
    expect(
      nativePhotoPosition({ GPSLatitude: 45, GPSLongitude: 4 }),
    ).toBeUndefined();
  });
});
