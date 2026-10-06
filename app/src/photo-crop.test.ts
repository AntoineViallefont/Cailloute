import { it, expect } from 'vitest';
import { croppedPrivacyPhoto } from './photo-crop';
import type { PrivacyPhoto } from './photo-privacy';
it('enregistre le recadrage dans la même photo sans réappliquer les masques déjà rendus', () => {
  const mask = { x: .1, y: .2, width: .2, height: .3 };
  const position = { lat: 45, lon: 4, source: 'capture' as const };
  const photo: PrivacyPhoto = { id: 'draft-a', original: new Blob(['original']), prepared: { base64: 'old', caption: 'Crédit', position }, automatic: [mask], manual: [mask], reviewed: true, detectionFailed: false };
  const blob = new Blob(['cropped']);
  const next = croppedPrivacyPhoto(photo, blob, { base64: 'new', caption: '', position });
  expect(next).toMatchObject({ id: photo.id, original: blob, automatic: [], manual: [], reviewed: false, prepared: { base64: 'new', caption: 'Crédit', position } });
  // Même mécanisme de remplacement que PhotoPicker : aucun brouillon perdu.
  expect([photo].map(p => p.id === next.id ? next : p)[0].prepared.base64).toBe('new');
  expect(photo.prepared.base64).toBe('old');
});
