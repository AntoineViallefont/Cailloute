import { readPhotoPosition, type PhotoPosition } from "./photo-location";
import { photoTask, checkPhotoAbort } from "./photo-task";
import { drawPhotoMasks, type PhotoMask } from "./photo-masks";
export interface PreparedPhoto {
  base64: string;
  caption: string;
  position?: PhotoPosition;
}
export const PHOTO_TARGET_BYTES = 40_000;
export const PREVIEW_TARGET_BYTES = PHOTO_TARGET_BYTES;
export const PREVIEW_MAX_SIZE = 960;
// Reconnaître aussi les anciens JPEG, conservés jusqu'à leur conversion.
export function photoDataUrl(base64: string): string {
  return base64.startsWith("data:") ? base64 : `data:image/${base64.startsWith("UklGR") ? "webp" : base64.startsWith("iVBOR") ? "png" : "jpeg"};base64,${base64}`;
}

// Poids du WebP réel ; la représentation base64 ajoute environ un tiers.
export async function preparePhotoCopy(
  blob: Blob,
  fallback?: PhotoPosition,
  masks: PhotoMask[] = [],
  signal?: AbortSignal,
  maxSize = PREVIEW_MAX_SIZE,
  targetBytes = PHOTO_TARGET_BYTES,
): Promise<{ prepared: PreparedPhoto; blob: Blob }> {
  checkPhotoAbort(signal);
  const position = fallback || await photoTask(readPhotoPosition(blob), 5000, "Métadonnées indisponibles.", signal).catch(() => undefined);
  checkPhotoAbort(signal);
  const image = await decodePhoto(blob, signal, maxSize);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Compression indisponible.");
    let scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    for (let attempt = 0; attempt < 12; attempt++) {
      checkPhotoAbort(signal);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawPhotoMasks(context, masks);
      const encode = (quality: number) =>
        photoTask(new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) =>
              result ? resolve(result) : reject(new Error("Photo illisible.")),
            "image/webp",
            quality,
          ),
        ), 8000, "Compression trop longue. Réessayez avec une photo plus petite.", signal);
      let result = await encode(0.9);
      if (result.type !== "image/webp") throw new Error("Encodage WebP indisponible sur cet appareil.");
      if (result.size > targetBytes) {
        let low = 0.45,
          high = 0.9;
        result = await encode(low);
        if (result.size > targetBytes) {
          scale *= 0.8;
          continue;
        }
        for (let i = 0; i < 5; i++) {
          const quality = (low + high) / 2;
          const candidate = await encode(quality);
          if (candidate.size <= targetBytes) {
            low = quality;
            result = candidate;
          } else high = quality;
        }
      }
      const base64 = await photoTask(new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("Lecture de la photo impossible."));
        reader.readAsDataURL(result);
      }), 5000, "Lecture de la photo trop longue.", signal);
      return { prepared: { base64, caption: "", ...(position ? { position } : {}) }, blob: result };
    }
    throw new Error("Impossible de compresser cette photo.");
  } finally {
    image.close();
  }
}

export async function decodePhoto(blob: Blob, signal?: AbortSignal, maxSize?: number) {
  let options: ImageBitmapOptions | undefined;
  if (maxSize) {
    // Lire l'en-tête permet au décodeur JPEG de réduire avant d'allouer les pixels originaux.
    const data = new DataView(await photoTask(blob.slice(0, 262144).arrayBuffer(), 1000, "Lecture trop longue.", signal));
    let width = 0, height = 0;
    if (data.byteLength >= 24 && data.getUint32(0) === 0x89504e47) {
      width = data.getUint32(16); height = data.getUint32(20);
    } else if (data.byteLength > 4 && data.getUint16(0) === 0xffd8) {
      let at = 2;
      while (at + 8 < data.byteLength && data.getUint8(at) === 0xff) {
        const marker = data.getUint8(at + 1), length = data.getUint16(at + 2);
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
          height = data.getUint16(at + 5); width = data.getUint16(at + 7); break;
        }
        if (length < 2) break;
        at += 2 + length;
      }
    }
    if (width > 0 && height > 0 && Math.max(width, height) > maxSize)
      options = {resizeWidth: Math.max(1, Math.round(width * maxSize / Math.max(width, height))), resizeQuality: "medium"};
  }
  checkPhotoAbort(signal);
  return photoTask(createImageBitmap(blob, options), 15000, "Décodage trop long. Réessayez avec une photo plus petite.", signal, image => image.close());
}
export async function preparePhoto(
  blob: Blob,
  fallback?: PhotoPosition,
  masks: PhotoMask[] = [],
  signal?: AbortSignal,
): Promise<PreparedPhoto> {
  return (await preparePhotoCopy(blob, fallback, masks, signal, PREVIEW_MAX_SIZE, PREVIEW_TARGET_BYTES)).prepared;
}

// Toutes les nouvelles copies sont en WebP, sans métadonnées.
export const preparePhotoPreview = preparePhoto;
export async function prepareSharedPreview(base64: string, signal?: AbortSignal): Promise<PreparedPhoto> {
  checkPhotoAbort(signal);
  const raw = atob(base64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""));
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  return preparePhoto(new Blob([bytes], { type: "image/jpeg" }), undefined, [], signal);
}

/** Convertir les copies de l'app ; les originaux de la galerie restent intacts. */
export async function convertPhotoUrl(url: string): Promise<string> {
  if (url.startsWith("data:image/webp;base64,")) {
    const raw = url.split(",")[1];
    if (atob(raw).length <= PHOTO_TARGET_BYTES) return url;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("Photo inaccessible.");
  const prepared = await preparePhoto(await response.blob());
  return photoDataUrl(prepared.base64);
}
