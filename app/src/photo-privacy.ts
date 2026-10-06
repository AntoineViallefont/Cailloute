import { detectHeads } from "./head-detection-client";
import { preparePhoto, preparePhotoCopy, PREVIEW_MAX_SIZE, type PreparedPhoto } from "./photo-input";
import { type PhotoPosition } from "./photo-location";
import { checkPhotoAbort } from "./photo-task";
import { type PhotoMask } from "./photo-masks";

export interface PrivacyPhoto {
  id: string;
  verifiedBlob?: Blob; // Rendu masqué validé, réservé à la compression et aux reprises locales.
  original: Blob; // Mémoire du sélecteur uniquement ; jamais transmis au stockage.
  prepared: PreparedPhoto;
  automatic: PhotoMask[];
  manual: PhotoMask[];
  detectionFailed: boolean;
  reviewed: boolean;
}
export async function preparePrivatePhoto(
  original: Blob,
  fallback?: PhotoPosition,
  signal?: AbortSignal,
  progress?: (message: string) => void,
): Promise<PrivacyPhoto> {
  const started = performance.now();
  progress?.("Réduction et compression de la photo…");
  // Copie de travail assez détaillée pour la détection avant la compression finale.
  const copy = await preparePhotoCopy(original, fallback, [], signal, PREVIEW_MAX_SIZE, 200_000);
  const working = copy.blob;
  let prepared = copy.prepared;
  progress?.("Recherche des visages…");
  let automatic: PhotoMask[] = [],
    detectionFailed = false;
  try {
    const result = await detectHeads(working, signal, (done, total) => progress?.(`Recherche des visages ${done} / ${total}…`), Math.max(200, 750 - (performance.now() - started)));
    automatic = result.masks;
    detectionFailed = result.incomplete;
  } catch {
    detectionFailed = true;
  }
  checkPhotoAbort(signal);
  progress?.(automatic.length ? "Application du floutage…" : "Création de l’aperçu…");
  // Analyse sur 960 px, puis seul l’aperçu masqué est enregistré.
  prepared = await preparePhoto(working, prepared.position, automatic, signal);
  return {
    id: crypto.randomUUID(),
    original: working,
    prepared,
    automatic,
    manual: [],
    detectionFailed,
    reviewed: false,
  };
}
