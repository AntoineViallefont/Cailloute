import type { Photo } from './types';

/** Un même fichier partagé par plusieurs sources n’apparaît qu’une fois. */
export function uniquePhotos(photos: Photo[]): Photo[] {
  const ids = new Set<string>(), contents = new Set<string>();
  return photos.filter(photo => {
    // Le MIME d’une ancienne copie peut différer alors que les octets sont identiques.
    const content = photo.url?.startsWith('data:')
      ? photo.url.slice(photo.url.indexOf(',') + 1).replace(/\s/g, '')
      : photo.url;
    if (ids.has(photo.id) || (content && contents.has(content))) return false;
    ids.add(photo.id);
    if (content) contents.add(content);
    return true;
  });
}
