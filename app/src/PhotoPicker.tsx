import {compressVerifiedPhoto} from "./photo-compression";
import { photoDataUrl } from "./photo-input";
import { Geolocation } from "@capacitor/geolocation";
import {
  nativePhotoPosition,
  validPosition,
  type PhotoPosition,
} from "./photo-location";
import { useEffect, useRef, useState } from "react";
import { Camera, Images, Trash2 } from "lucide-react";
import { Camera as NativeCamera, MediaTypeSelection } from "@capacitor/camera";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Modal } from "./Modal";
import { PhotoPrivacyReview } from "./PhotoPrivacyReview";
import { preparePrivatePhoto, type PrivacyPhoto } from "./photo-privacy";
import { photoTask, checkPhotoAbort } from "./photo-task";
import { releaseHeadDetector, warmHeadDetector } from "./head-detection-client";
import { type PreparedPhoto } from "./photo-input";
import { prepareNativePrivatePhoto } from "./native-photo-privacy";

const InAppCamera = registerPlugin<{takePhoto(options: {limit:number}): Promise<{uri?:string;files?:{uri:string}[]}>}>("CaillouteCamera");
const PhotoFiles = registerPlugin<{
  choose(options: { limit: number; includePosition: boolean }): Promise<{ files: { uri: string }[] }>;
}>("CailloutePhotoFiles");

export function PhotoPicker({
  onAdd,
  onClose,
  locatePhotos = false,
}: {
  locatePhotos?: boolean;
  onAdd: (photos: PreparedPhoto[]) => Promise<void>;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<PrivacyPhoto[]>([]);
  const photosRef=useRef(photos);photosRef.current=photos;
  const [compression,setCompression]=useState<Record<string,"compressing"|"error">>({});
  const compressors=useRef(new Map<string,AbortController>());
  const compressionQueue=useRef(Promise.resolve());
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const remaining = Number.MAX_SAFE_INTEGER;
  const task = useRef<AbortController | null>(null);
  const committing = useRef(false);
  useEffect(() => { warmHeadDetector(); return () => { task.current?.abort(); for(const controller of compressors.current.values())controller.abort(); releaseHeadDetector(); }; }, []);
  function cancelCompression(id:string){
    compressors.current.get(id)?.abort();compressors.current.delete(id);
    setCompression(old=>{const next={...old};delete next[id];return next;});
  }
  function compress(photo:PrivacyPhoto,masked:Blob){
    cancelCompression(photo.id);
    const controller=new AbortController();compressors.current.set(photo.id,controller);
    setCompression(old=>({...old,[photo.id]:"compressing"}));
    compressionQueue.current=compressionQueue.current.catch(()=>{}).then(async()=>{
      if(controller.signal.aborted)return;
      try{
        const prepared=await compressVerifiedPhoto(masked,photo.prepared,controller.signal);
        if(compressors.current.get(photo.id)!==controller)return;
        setPhotos(old=>old.map(p=>p.id===photo.id?{...p,prepared}:p));
        cancelCompression(photo.id);
      }catch{
        if(compressors.current.get(photo.id)!==controller||controller.signal.aborted)return;
        compressors.current.delete(photo.id);setCompression(old=>({...old,[photo.id]:"error"}));
      }
    });
  }
  async function prepare(
    items: { file: Blob | string; position?: PhotoPosition }[],
    controller = new AbortController(),
  ) {
    if (controller.signal.aborted) return;
    task.current = controller;
    const signal = controller.signal;
    setBusy(true);
    setError("");
    let failed = 0;
    const prepared: PrivacyPhoto[] = [];
    for (const [index, item] of items.slice(0, remaining).entries()) {
      setProgress(
        `Analyse de la photo ${index + 1} / ${Math.min(items.length, remaining)}…`,
      );
      try {
        checkPhotoAbort(signal);
        const progress = (stage: string) => setProgress(`Photo ${index + 1} / ${Math.min(items.length, remaining)} · ${stage}`);
        prepared.push(
          Capacitor.getPlatform() === "android" && typeof item.file === "string" && /^(content|file):\/\//.test(item.file)
          ? await prepareNativePrivatePhoto(item.file, item.position, signal, progress, locatePhotos)
          : await preparePrivatePhoto(
            typeof item.file === "string"
              ? await photoTask(fetch(item.file, { signal }).then(r => { if (!r.ok) throw new Error("Photo inaccessible."); return r.blob(); }), 15000, "Lecture de la photo trop longue.", signal)
              : item.file,
            item.position,
            signal,
            progress,
          ),
        );
      } catch {
        if (signal.aborted) break;
        failed++;
      }
    }
    if (task.current !== controller) return;
    task.current = null;
    releaseHeadDetector();
    setPhotos((previous) => [...previous, ...prepared]);
    if (prepared.length) setPreview(photos.length);
    setError(
      [
        failed
          ? `${failed} photo(s) inaccessible(s) ou trop longue(s) à préparer. Réessayez une par une. Les autres sont conservées.`
          : "",
        items.length > remaining
          ? ""
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    setBusy(false);
    setProgress("");
  }
  async function capturePosition(): Promise<PhotoPosition | undefined> {
    if (!locatePhotos) return;
    try {
      const p = await photoTask(Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }), 20000, "Position indisponible.", task.current?.signal);
      const position = {
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        source: "capture" as const,
      };
      return validPosition(position) ? position : undefined;
    } catch {
      return undefined;
    }
  }
  async function choose(capture: boolean) {
    warmHeadDetector();
    if (!Capacitor.isNativePlatform()) {
      (capture ? camera : gallery).current?.click();
      return;
    }
    const controller = new AbortController(); task.current = controller;
    setBusy(true);
    setProgress("Ouverture des photos…");
    setError("");
    try {
      if (capture && Capacitor.getPlatform() === "android") {
        const result = await InAppCamera.takePhoto({limit:Math.min(30,remaining)});
        checkPhotoAbort(controller.signal);
        const files = result.files || (result.uri ? [{uri:result.uri}] : []);
        if (locatePhotos && files.length === 1) setProgress("Recherche de la position…");
        // Une série utilise le GPS propre à chaque photo, jamais une position finale commune.
        const position = files.length === 1 ? await capturePosition() : undefined;
        await prepare(files.map(({uri})=>({file:uri,position})),controller);
        return;
      }
      if (!capture && Capacitor.getPlatform() === "android") {
        const result = await photoTask(PhotoFiles.choose({ limit: 2147483647, includePosition: locatePhotos }), 120000,
          "La galerie ne répond pas. Fermez-la puis réessayez.", controller.signal);
        checkPhotoAbort(controller.signal);
        await prepare(result.files.map(({ uri }) => ({ file: uri })), controller);
        return;
      }
      const items = capture
        ? [await photoTask(NativeCamera.takePhoto({
            quality: 95,
            correctOrientation: true,
            includeMetadata: locatePhotos,
          }), 120000, "L’appareil photo ne répond pas. Réessayez.", controller.signal)]
        : (await photoTask(NativeCamera.chooseFromGallery({
            mediaType: MediaTypeSelection.Photo,
            allowMultipleSelection: true,
            includeMetadata: locatePhotos,
          }), 120000, "La galerie ne répond pas. Réessayez.", controller.signal)).results;
      const paths = items.map(
        (item) =>
          (Capacitor.getPlatform() === "android" && item.uri
            ? item.uri.startsWith("/") ? "file://" + item.uri : item.uri
            : item.webPath || (item.uri ? Capacitor.convertFileSrc(item.uri) : "")),
      );
      if (paths.some((path) => !path)) throw new Error("Photo inaccessible.");
      checkPhotoAbort(controller.signal);
      if (capture && locatePhotos) setProgress("Recherche de la position…");
      const captureGPS = capture ? await capturePosition() : undefined;
      await prepare(
        paths.map((file, index) => ({
          file,
          position:
            nativePhotoPosition(items[index].metadata?.exif) || captureGPS,
        })),
        controller,
      );
    } catch (e) {
      if (!/cancel|annul|AbortError|OS-PLUG-CAMR-0010/i.test(String(e)))
        setError(e instanceof Error ? e.message : "Photos inaccessibles. Réessayez.");
    } finally {
      if (task.current === controller) {
        task.current = null;
        setBusy(false); setProgress("");
      }
    }
  }
  return (
    <Modal
      title="Ajouter des photos"
      onClose={() => {
        if (!committing.current) { task.current?.abort(); onClose(); }
      }}
    >
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void prepare(
            Array.from(e.target.files || []).map((file) => ({ file })),
          );
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          const controller = new AbortController(); task.current = controller;
          setBusy(true); setProgress("Recherche de la position…");
          void (async () => {
            const position = await capturePosition();
            try { await prepare(files.map((file) => ({ file, position })), controller); }
            finally { if (controller.signal.aborted) { task.current = null; setBusy(false); setProgress(""); } }
          })();
        }}
      />
      <div className="photo-source-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy || remaining <= 0}
          onClick={() => void choose(false)}
        >
          <Images size={20} /> Galerie
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || remaining <= 0}
          onClick={() => void choose(true)}
        >
          <Camera size={20} />{" "}
          {photos.length ? "Prendre une autre photo" : "Prendre une photo"}
        </button>
      </div>
      <p className="muted">
        Têtes floutées automatiquement sur votre appareil. Vérifiez chaque photo
        avant l’ajout. Vos originaux sont conservés.
      </p>
      <div className="photo-drafts privacy-drafts">
        {photos.map((photo, index) => (
          <div key={photo.id}>
            <button
              type="button"
              className="photo-preview"
              aria-label={`Vérifier la photo ${index + 1}`}
              disabled={busy}
              onClick={() => {cancelCompression(photo.id);setPhotos(old=>old.map(p=>p.id===photo.id?{...p,reviewed:false}:p));setPreview(index);}}
            >
              <img
                src={photoDataUrl(photo.prepared.base64)}
                alt={`Photo ${index + 1}`}
              />
            </button>
            <span
              className={photo.reviewed ? "photo-reviewed" : "photo-unreviewed"}
            >
              {compression[photo.id]==="compressing"?"Préparation…":compression[photo.id]==="error"?"Préparation interrompue":photo.reviewed ? "Vérifiée" : "À vérifier"}
            </span>
            {compression[photo.id]==="error" && <button type="button" className="text-button" onClick={()=>{if(photo.verifiedBlob)compress(photo,photo.verifiedBlob);}}>Réessayer</button>}
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              aria-label={`Retirer la photo ${index + 1}`}
              onClick={() => {cancelCompression(photo.id);setPhotos((items) => items.filter((_, i) => i !== index));}}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {busy && task.current && <button className="secondary" type="button" onClick={() => task.current?.abort()}>Annuler la préparation</button>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label className="consent-row"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>Ces photos sont les miennes, les personnes sont non identifiables ou leur diffusion est autorisée. J’autorise leur affichage dans Cailloute selon les conditions « À propos ».</label>
      <button
        type="button"
        className="primary"
        disabled={!rights || busy || !photos.length || photos.some((p) => !p.reviewed) || Object.keys(compression).length>0}
        onClick={async () => {
          if (!rights || photos.some((p) => !p.reviewed) || Object.keys(compression).length>0 || compressors.current.size>0) return;
          committing.current = true;
          setBusy(true);
          setProgress("Enregistrement des photos…");
          setError("");
          try {
            await onAdd(photos.map((p) => p.prepared));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            committing.current = false;
            setBusy(false); setProgress("");
          }
        }}
      >
        {busy
          ? progress || "Préparation…"
          : `Ajouter ${photos.length || "les"} photo${photos.length === 1 ? "" : "s"}`}
      </button>
      {preview !== null && photos[preview] && (
        <PhotoPrivacyReview
          key={photos[preview].id}
          photo={photos[preview]}
          number={preview + 1}
          total={photos.length}
          onSave={()=>{}}
          onConfirm={(photo,masked) => {
            setPhotos(items=>items.map(p=>p.id===photo.id?photo:p));
            compress(photo,masked);
            const pending = photosRef.current.findIndex(p=>p.id!==photo.id&&!p.reviewed);
            setPreview(pending < 0 ? null : pending);
          }}
          onClose={() => setPreview(null)}
        />
      )}
    </Modal>
  );
}
