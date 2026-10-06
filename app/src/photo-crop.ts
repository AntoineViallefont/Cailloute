import type { PrivacyPhoto } from './photo-privacy';
import type { PreparedPhoto } from './photo-input';

/** Le recadrage part d’un rendu déjà masqué ; l’identité de la photo reste stable. */
export function croppedPrivacyPhoto(photo: PrivacyPhoto, original: Blob, prepared: PreparedPhoto): PrivacyPhoto {
  return {
    ...photo, original, verifiedBlob:undefined, automatic: [], manual: [], reviewed: false,
    prepared: { ...prepared, caption: photo.prepared.caption },
  };
}
