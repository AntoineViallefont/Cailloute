import { registerPlugin } from '@capacitor/core';
import { checkPhotoAbort, photoTask } from './photo-task';
const portraits = registerPlugin<{
  prepare(options: { uri: string; includePosition: false; detectFaces: false; id: string }): Promise<{base64: string}>;
  cancelPrepare(options: {id: string}): Promise<void>;
}>('CaillouteFaces');
/** Prépare uniquement une copie réduite et orientée ; ne démarre aucun détecteur. */
export async function prepareNativeAvatar(uri: string, signal?: AbortSignal): Promise<Blob> {
  checkPhotoAbort(signal);
  const id = crypto.randomUUID();
  const cancel = () => { void portraits.cancelPrepare({id}).catch(() => {}); };
  signal?.addEventListener('abort', cancel, {once: true});
  try {
    const reduced = await photoTask(portraits.prepare({uri, includePosition:false, detectFaces:false, id}), 15000, 'Lecture trop longue. Choisissez une photo disponible sur votre téléphone.', signal);
    checkPhotoAbort(signal);
    return new Blob([Uint8Array.from(atob(reduced.base64), value => value.charCodeAt(0))], {type:'image/jpeg'});
  } catch (error) { cancel(); throw error; }
  finally { signal?.removeEventListener('abort', cancel); }
}
