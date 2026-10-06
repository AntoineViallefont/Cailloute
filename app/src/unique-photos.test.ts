import { describe, it, expect } from 'vitest';
import { uniquePhotos } from './unique-photos';
import type { Photo } from './types';
const photo = (id: string, url: string) => ({ id, url } as Photo);
describe('photos dupliquées entre fiches sources', () => {
  it('affiche une seule fois les triples, même avec un MIME différent', () => {
    const first = photo('a', 'data:image/jpeg;base64,YWJj');
    expect(uniquePhotos([first, photo('b','data:image/webp;base64,YWJj'), photo('c','data:image/jpeg;base64,YWJj')])).toEqual([first]);
  });
  it('conserve les fichiers distincts et les références de la première source', () => {
    expect(uniquePhotos([photo('a','/photo/a'), photo('b','/photo/b'), photo('c','/photo/a')]).map(p=>p.id)).toEqual(['a','b']);
  });
  it('déduplique aussi les IDs sans confondre les fichiers manquants', () => {
    expect(uniquePhotos([photo('a',''), photo('a',''), photo('b','')])).toHaveLength(2);
  });
});
