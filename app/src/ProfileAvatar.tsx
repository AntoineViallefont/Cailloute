import { freeCollaborationEnabled, getFreeSession } from "./free-cloud";
import { useFreeAccount } from "./useFreeAccount";
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserRound, Camera, ImagePlus, Trash2 } from 'lucide-react';
import { Camera as NativeCamera, MediaTypeSelection } from '@capacitor/camera';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { db, user, apiBase, native } from './store';
import { personalMode } from './personal';
import { Modal } from './Modal';
import { AvatarCrop } from './AvatarCrop';
import { encodeAvatar, CENTERED_AVATAR, type AvatarCrop as Crop } from './avatar-crop';
import { decodePhoto, convertPhotoUrl } from './photo-input';
import { photoTask, checkPhotoAbort } from './photo-task';
import { prepareNativeAvatar } from './native-avatar';

const photoFiles = registerPlugin<{choose(options: {limit: number}): Promise<{files: {uri: string}[]}>}>('CailloutePhotoFiles');
export function avatarKey() { return `profile-avatar:${freeCollaborationEnabled ? getFreeSession()?.uid || 'guest' : personalMode || !user ? 'personal' : `${apiBase()}:${user.id}`}`; }
export function useProfileAvatar() {
  const key = avatarKey(); const row = useLiveQuery(() => db.meta.get(key), [key]);
  useEffect(() => {
    if (!native) return;
    let stopped=false;
    void (async()=>{
      if (await db.meta.get(key)) return;
      try {
        const saved=await Filesystem.readFile({path:`avatars/${encodeURIComponent(key)}.txt`,directory:Directory.Data,encoding:Encoding.UTF8});
        if(!stopped && typeof saved.data==='string' && /^data:image\/(jpeg|webp);base64,/.test(saved.data)) {
          const value=await convertPhotoUrl(saved.data);
          if(stopped) return;
          await Filesystem.writeFile({path:`avatars/${encodeURIComponent(key)}.txt`,data:value,directory:Directory.Data,encoding:Encoding.UTF8,recursive:true});
          await db.meta.put({key,value});
        }
      }catch { /* Aucun portrait natif enregistré. */ }
    })();
    return()=>{stopped=true;};
  },[key]);
  return row?.key===key && typeof row?.value === 'string' && /^data:image\/(jpeg|webp);base64,/.test(row.value) ? row.value : undefined;
}
export function ProfileAvatar({ small = false }: { small?: boolean }) {
  const account=useFreeAccount();
  const photo = useProfileAvatar();
  return <span className={small ? 'profile-avatar nav-avatar' : 'profile-avatar'}>{photo && (!freeCollaborationEnabled || account) ? <img src={photo} alt="" /> : <UserRound size={small ? 32 : 30} />}</span>;
}
export function ProfileAvatarEditor({ onClose }: { onClose: () => void }) {
  const current = useProfileAvatar(), key = avatarKey();
  const [image, setImage] = useState<ImageBitmap>();
  const [crop, setCrop] = useState<Crop>({ ...CENTERED_AVATAR });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null), task = useRef<AbortController | null>(null), source = useRef<ImageBitmap | undefined>(undefined), saving = useRef(false);
  useEffect(() => () => { task.current?.abort(); source.current?.close(); }, []);
  function close() { if (saving.current) return; task.current?.abort(); onClose(); }
  function cancel() { task.current?.abort(); task.current = null; setBusy(false); setError(''); }
  async function decode(blob: Blob, signal: AbortSignal) {
    if (blob.size > 30 * 1024 * 1024) throw new Error('Choisissez une image de moins de 30 Mo.');
    const next = await decodePhoto(blob, signal, 1024); checkPhotoAbort(signal);
    source.current?.close(); source.current = next; setImage(next); setCrop({ ...CENTERED_AVATAR });
  }
  async function prepare(blob: Blob) {
    const controller = new AbortController(); task.current?.abort(); task.current = controller;
    setBusy(true); setError('');
    try { await decode(blob, controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Image illisible.'); }
    finally { if (task.current === controller) { task.current = null; setBusy(false); } }
  }
  async function choose() {
    if (!native) { fileInput.current?.click(); return; }
    const controller = new AbortController(); task.current?.abort(); task.current = controller;
    setBusy(true); setError('');
    try {
      if (Capacitor.getPlatform() === 'android') {
        const result = await photoTask(photoFiles.choose({ limit: 1 }), 120000, 'Sélection trop longue. Réessayez.', controller.signal);
        const uri = result.files[0]?.uri; if (!uri) return;
        await decode(await prepareNativeAvatar(uri, controller.signal), controller.signal);
      } else {
        const result = await photoTask(NativeCamera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false, limit: 1, includeMetadata: false }), 120000, 'Sélection trop longue. Réessayez.', controller.signal);
        const item = result.results[0]; if (!item) return;
        const path = item.webPath || (item.uri ? Capacitor.convertFileSrc(item.uri) : '');
        if (!path) throw new Error('Image inaccessible.');
        const blob = await photoTask(fetch(path, { signal: controller.signal }).then(r => r.blob()), 15000, 'Lecture trop longue.', controller.signal);
        await decode(blob, controller.signal);
      }
    } catch (e) { if (!controller.signal.aborted && !/cancel|annul|OS-PLUG-CAMR-0010/i.test(String(e))) setError(e instanceof Error ? e.message : 'Impossible d’ouvrir cette image.'); }
    finally { if (task.current === controller) { task.current = null; setBusy(false); } }
  }
  async function save(remove = false) {
    const controller = new AbortController(); task.current = controller; saving.current = true; setBusy(true); setError('');
    try {
      const path=`avatars/${encodeURIComponent(key)}.txt`;
      if (remove) {
        if(native) await Filesystem.deleteFile({path,directory:Directory.Data}).catch(error=>{if(!/not exist|not found|ENOENT/i.test(String(error))) throw error;});
        await db.meta.delete(key);
      } else if (image) {
        const value=await encodeAvatar(image,crop,controller.signal);
        // Copie durable Android, indépendante du stockage de la WebView.
        if(native) await Filesystem.writeFile({path,data:value,directory:Directory.Data,encoding:Encoding.UTF8,recursive:true});
        await db.meta.put({key,value});
        if((await db.meta.get(key))?.value!==value) throw new Error('La photo n’a pas été enregistrée. Réessayez.');
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible d’enregistrer la photo.'); }
    finally { saving.current = false; task.current = null; setBusy(false); }
  }
  return <Modal title="Photo de profil" onClose={close}>
    <div className="avatar-editor">
      {image ? <AvatarCrop image={image} crop={crop} onChange={setCrop} /> : <span className="profile-avatar avatar-preview">{current ? <img src={current} alt="Photo de profil actuelle" /> : <Camera size={36} />}</span>}
      <input ref={fileInput} type="file" accept="image/*" aria-label="Choisir une image de profil" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void prepare(file); }} />
      <button className="secondary" disabled={busy} onClick={() => void choose()}><ImagePlus size={18} />{image ? 'Choisir une autre image' : 'Choisir une image'}</button>
      {busy && <p role="status">{saving.current ? 'Enregistrement…' : 'Ouverture de la photo…'}</p>}
      {busy && !saving.current && <button className="secondary" onClick={cancel}>Annuler la préparation</button>}
      {image && <button className="primary" disabled={busy} onClick={() => void save()}>Enregistrer</button>}
      <button className="text-button" disabled={saving.current} onClick={close}>Annuler</button>
      {current && <button className="text-button danger" disabled={busy} onClick={() => void save(true)}><Trash2 size={17} />Retirer la photo</button>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  </Modal>;
}
