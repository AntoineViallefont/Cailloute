import { registerPlugin } from "@capacitor/core";
import { type HeadDetection } from "./head-detection-client";
import { type PhotoPosition, validPosition } from "./photo-location";
import { preparePhoto, type PreparedPhoto } from "./photo-input";
import { checkPhotoAbort, photoTask } from "./photo-task";
import { type PrivacyPhoto } from "./photo-privacy";

type NativePrepared = HeadDetection & {
  base64: string;
  position?: PhotoPosition;
  preview?: PreparedPhoto;
  timings?: Record<string, number>;
};
const faces = registerPlugin<{
  prepare(options: { uri: string; includePosition: boolean; id: string }): Promise<NativePrepared>;
  cancelPrepare(options: { id: string }): Promise<void>;
}>("CaillouteFaces");

// L’original reste chez son fournisseur Android. Seule la copie réduite traverse le pont.
export async function prepareNativePrivatePhoto(
  uri: string,
  fallback?: PhotoPosition,
  signal?: AbortSignal,
  progress?: (message: string) => void,
  includePosition = false,
): Promise<PrivacyPhoto> {
  checkPhotoAbort(signal);
  progress?.("Réduction et recherche des visages…");
  const id = crypto.randomUUID();
  const cancel = () => { void faces.cancelPrepare({ id }).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  let result: NativePrepared;
  try {
    result = await photoTask(faces.prepare({ uri, includePosition, id }), 15000,
      "Lecture trop longue. Essayez une photo déjà téléchargée sur votre appareil.", signal);
  } catch (error) { cancel(); throw error; }
  finally { signal?.removeEventListener("abort", cancel); }
  checkPhotoAbort(signal);
  const raw = atob(result.base64);
  const original = new Blob([Uint8Array.from(raw, value => value.charCodeAt(0))], { type: "image/jpeg" });
  const position = validPosition(result.position) ? result.position : fallback;
  progress?.("Création de l’aperçu flouté…");
  const prepared = result.preview
    ? { ...result.preview, ...(position ? { position } : {}) }
    : await preparePhoto(original, position, result.masks, signal);
  checkPhotoAbort(signal);
  return { id: crypto.randomUUID(), original, prepared, automatic: result.masks, manual: [],
    detectionFailed: result.incomplete, reviewed: false };
}
