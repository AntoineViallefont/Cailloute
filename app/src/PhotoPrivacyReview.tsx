import {photoPreview,compressVerifiedPhoto} from "./photo-compression";
import { croppedPrivacyPhoto } from "./photo-crop";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Modal } from "./Modal";
import { boundedMask, drawPhotoMasks, type PhotoMask } from "./photo-masks";
import { decodePhoto, PREVIEW_MAX_SIZE } from "./photo-input";
import type { PrivacyPhoto } from "./photo-privacy";

export function PhotoPrivacyReview({
  photo: initialPhoto,
  editing = false,
  number,
  total,
  onSave,
  onConfirm,
  onClose,
}: {
  photo: PrivacyPhoto;
  editing?: boolean;
  number: number;
  total: number;
  onSave: (photo: PrivacyPhoto) => void | Promise<void>;
  onConfirm?: (photo:PrivacyPhoto,masked:Blob)=>void;
  onClose: () => void;
}) {
  const [photo,setPhoto] = useState(initialPhoto);
  const [cropping,setCropping] = useState(false);
  const [crop,setCrop] = useState<PhotoMask|null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [fittedWidth, setFittedWidth] = useState(1);
  const image = useRef<ImageBitmap | null>(null);
  const preparedImage = useRef<ImageBitmap | null>(null);
  const [manual, setManual] = useState(photo.manual);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const multi = useRef(false);
  const lastTouch = useRef(0);
  const tap = useRef({ time: 0, x: 0, y: 0 });
  const down = useRef({ time: 0, x: 0, y: 0, moved: false });
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const [selection, setSelection] = useState<PhotoMask | null>(null);
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  function redraw() {
    if (!canvas.current || !image.current) return;
    const context = canvas.current.getContext("2d")!;
    const unchanged = JSON.stringify(manual) === JSON.stringify(photo.manual);
    // L'aperçu contient déjà les masques validés : aucun second floutage à l'ouverture.
    const cached = unchanged && preparedImage.current;
    context.drawImage(
      cached || image.current,
      0,
      0,
      canvas.current.width,
      canvas.current.height,
    );
    if (!cached) drawPhotoMasks(context, [
      ...photo.automatic.map((m) => ({ ...m, rounded: true })),
      ...manual,
    ]);
  }
  useEffect(() => {
    let cancelled = false;
    const raw = atob(photo.prepared.base64);
    const prepared = new Blob([Uint8Array.from(raw, value => value.charCodeAt(0))], { type: "image/webp" });
    // La vérification porte sur l'image réellement partagée (960 px maximum), pas une grande copie.
    void Promise.allSettled([
      decodePhoto(photo.original, undefined, PREVIEW_MAX_SIZE),
      decodePhoto(prepared, undefined, PREVIEW_MAX_SIZE),
    ])
      .then((results) => {
        if (results.some(result => result.status === "rejected")) {
          results.forEach(result => { if (result.status === "fulfilled") result.value.close(); });
          throw new Error("Photo illisible");
        }
        const [bitmap, alreadyBlurred] = results.map(result => (result as PromiseFulfilledResult<ImageBitmap>).value);
        if (cancelled) {
          bitmap.close(); alreadyBlurred.close();
          return;
        }
        image.current = bitmap;
        preparedImage.current = alreadyBlurred;
        const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
        canvas.current!.width = Math.round(bitmap.width * scale);
        canvas.current!.height = Math.round(bitmap.height * scale);
        redraw();
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Photo illisible. Fermez cet aperçu et retirez la photo.");
      });
    return () => {
      cancelled = true;
      image.current?.close();
      image.current = null;
      preparedImage.current?.close();
      preparedImage.current = null;
    };
  }, [photo.original, photo.prepared.base64]);
  useEffect(redraw, [manual, ready]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !image.current) return;
    const fit = () =>
      setFittedWidth(
        Math.min(
          element.clientWidth,
          (element.clientHeight * image.current!.width) / image.current!.height,
        ),
      );
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [ready]);
  useLayoutEffect(() => {
    if (pendingScroll.current && viewport.current) {
      viewport.current.scrollLeft = pendingScroll.current.left;
      viewport.current.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom]);
  function zoomTo(value: number, x: number, y: number, nextX = x, nextY = y) {
    const node = viewport.current,
      photoCanvas = canvas.current;
    if (!node || !photoCanvas || !ready || savingRef.current) return;
    const next = Math.max(1, Math.min(6, value));
    const rect = node.getBoundingClientRect(),
      picture = photoCanvas.getBoundingClientRect();
    const px = (x - picture.left) / picture.width,
      py = (y - picture.top) / picture.height;
    const newWidth = fittedWidth * next,
      newHeight = (newWidth * photoCanvas.height) / photoCanvas.width;
    const target = {
      left:
        px * newWidth +
        Math.max(0, (node.clientWidth - newWidth) / 2) -
        (nextX - rect.left),
      top: py * newHeight - (nextY - rect.top),
    };
    if (next === zoomRef.current) {
      node.scrollLeft = target.left;
      node.scrollTop = target.top;
    } else {
      pendingScroll.current = target;
      zoomRef.current = next;
      setZoom(next);
    }
  }
  const zoomAction = useRef(zoomTo);
  zoomAction.current = zoomTo;
  useEffect(() => {
    const node = viewport.current!;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoomAction.current(
        zoomRef.current * Math.exp(-event.deltaY * 0.01),
        event.clientX,
        event.clientY,
      );
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  function point(e: PointerEvent) {
    const bounds = canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height)),
    };
  }
  function rectangle(a: { x: number; y: number }, b: { x: number; y: number }) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }
  return (
    <Modal
      title={editing ? "Modifier la photo" : `Vérifier la photo ${number} / ${total}`}
      className="privacy-review"
      onClose={() => {
        if (!savingRef.current) onClose();
      }}
    >
      {!editing && <p className={photo.detectionFailed ? "error" : "muted"} role="status">
        {photo.detectionFailed
          ? "Analyse incomplète ou indisponible. Vérifiez toute la photo et masquez les têtes oubliées."
          : photo.automatic.length
            ? "Floutage automatique appliqué. Vérifiez les têtes oubliées."
            : "Aucune tête détectée. Vérifiez tout de même la photo."}
      </p>}
      <div className="privacy-toolbar">
        <button
          type="button"
          className={drawing ? "primary" : "secondary"}
          disabled={!ready || saving}
          aria-pressed={drawing}
          onClick={() => {setCropping(false);setCrop(null);setDrawing(!drawing);}}
        >
          Masquer une zone
        </button>
        <button type="button" className={cropping?"primary":"secondary"} disabled={!ready || saving} onClick={()=>{setCropping(!cropping);setDrawing(!cropping);setCrop(null);}}>Recadrer</button>
        {cropping && <button type="button" className="secondary" disabled={!crop || saving} onClick={async()=>{
          if(!crop || !canvas.current || savingRef.current)return;
          savingRef.current=true;setSaving(true);setError("");
          try{
            // Recadrer l’aperçu masqué conserve tous les floutages, y compris les ajouts non enregistrés.
            redraw();const source=canvas.current,c=document.createElement('canvas');
            c.width=Math.max(1,Math.round(crop.width*source.width));c.height=Math.max(1,Math.round(crop.height*source.height));
            c.getContext('2d')!.drawImage(source,crop.x*source.width,crop.y*source.height,crop.width*source.width,crop.height*source.height,0,0,c.width,c.height);
            const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Recadrage impossible.')),'image/png'));
            const prepared=await photoPreview(blob,photo.prepared);
            setReady(false);setManual([]);setPhoto(croppedPrivacyPhoto(photo,blob,prepared));
            setCrop(null);setSelection(null);setCropping(false);setDrawing(false);zoomRef.current=1;setZoom(1);
          }catch(e){setError((e as Error).message);}finally{savingRef.current=false;setSaving(false);}
        }}>Appliquer le recadrage</button>}
        <button
          type="button"
          className="secondary"
          disabled={!manual.length || saving}
          onClick={() => setManual((m) => m.slice(0, -1))}
        >
          Annuler le dernier ajout
        </button>
      </div>
      <p className="muted privacy-instruction">
        {cropping
          ? "Tracez le rectangle à conserver, puis appuyez sur Appliquer le recadrage."
          : drawing
          ? "Tracez une zone avec un doigt. Pincez avec deux doigts pour zoomer."
          : "Pincez pour zoomer, glissez pour déplacer. Double appui pour agrandir ou revenir."}
      </p>
      <div
        ref={viewport}
        className="privacy-image-scroll"
        role="region"
        tabIndex={0}
        aria-label="Photo : pincer pour zoomer, glisser pour déplacer, double appui pour agrandir"
        data-zoom={zoom}
        onKeyDown={(e) => {
          if (!["+", "=", "-", "0"].includes(e.key)) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          zoomTo(
            e.key === "0" ? 1 : zoomRef.current * (e.key === "-" ? 0.8 : 1.25),
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
        }}
        onDoubleClick={(e) => {
          if (Date.now() - lastTouch.current < 700) return;
          start.current = null;
          setSelection(null);
          zoomTo(zoomRef.current > 1 ? 1 : 2.5, e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !ready || saving) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (e.pointerType !== "mouse") lastTouch.current = Date.now();
          if (!pointers.current.size) multi.current = false;
          else {
            multi.current = true;
            start.current = null;
            setSelection(null);
            tap.current.time = 0;
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          down.current = {
            time: Date.now(),
            x: e.clientX,
            y: e.clientY,
            moved: multi.current,
          };
          if (drawing && !multi.current)
            start.current = { ...point(e), pointer: e.pointerId };
        }}
        onPointerMove={(e) => {
          const previous = pointers.current.get(e.pointerId);
          if (!previous) return;
          const next = { x: e.clientX, y: e.clientY };
          if (Math.hypot(next.x - down.current.x, next.y - down.current.y) > 8)
            down.current.moved = true;
          if (pointers.current.size === 2) {
            const other = [...pointers.current.entries()].find(
              ([id]) => id !== e.pointerId,
            )![1];
            const before = Math.hypot(
              previous.x - other.x,
              previous.y - other.y,
            );
            const after = Math.hypot(next.x - other.x, next.y - other.y);
            if (before > 0)
              zoomTo(
                (zoomRef.current * after) / before,
                (previous.x + other.x) / 2,
                (previous.y + other.y) / 2,
                (next.x + other.x) / 2,
                (next.y + other.y) / 2,
              );
          } else if (
            drawing &&
            !multi.current &&
            start.current?.pointer === e.pointerId
          ) {
            setSelection(rectangle(start.current, point(e)));
          } else if (pointers.current.size === 1) {
            e.currentTarget.scrollLeft -= next.x - previous.x;
            e.currentTarget.scrollTop -= next.y - previous.y;
          }
          pointers.current.set(e.pointerId, next);
        }}
        onPointerUp={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.delete(e.pointerId);
          if (
            !multi.current &&
            drawing &&
            start.current?.pointer === e.pointerId
          ) {
            const mask = boundedMask(rectangle(start.current, point(e)));
            if (mask && mask.width > 0.003 && mask.height > 0.003)
              if(cropping)setCrop(mask);else setManual((m) => [...m, mask]);
          }
          start.current = null;
          setSelection(null);
          if (
            !multi.current &&
            e.pointerType !== "mouse" &&
            !down.current.moved &&
            Date.now() - down.current.time < 300
          ) {
            if (
              Date.now() - tap.current.time < 320 &&
              Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) <
                30
            ) {
              zoomTo(zoomRef.current > 1 ? 1 : 2.5, e.clientX, e.clientY);
              tap.current.time = 0;
            } else
              tap.current = { time: Date.now(), x: e.clientX, y: e.clientY };
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          start.current = null;
          setSelection(null);
          tap.current.time = 0;
        }}
      >
        <div
          className="privacy-image"
          style={{ width: `${fittedWidth * zoom}px` }}
        >
          <canvas
            ref={canvas}
            aria-label="Aperçu de la photo avec les zones floutées"
            style={{
              touchAction: "none",
              cursor: drawing ? "crosshair" : "grab",
              visibility: ready ? "visible" : "hidden",
            }}
          />
          {(selection || crop) && (
            <div
              className="privacy-selection"
              style={{
                left: `${(selection || crop)!.x * 100}%`,
                top: `${(selection || crop)!.y * 100}%`,
                width: `${(selection || crop)!.width * 100}%`,
                height: `${(selection || crop)!.height * 100}%`,
              }}
            />
          )}
        </div>
      </div>
      <button
        type="button"
        className="text-button"
        disabled={!ready || saving}
        onClick={() =>
          setManual((m) => [...m, { x: 0, y: 0, width: 1, height: 1 }])
        }
      >
        Masquer toute la photo
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={!ready || saving}
        onClick={async () => {
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          setError("");
          try {
            redraw();
            const masked=await new Promise<Blob>((resolve,reject)=>canvas.current!.toBlob(blob=>blob?resolve(blob):reject(Error("Préparation impossible.")),"image/png"));
            const snapshot={...photo,manual,verifiedBlob:masked,prepared:await photoPreview(masked,photo.prepared),reviewed:true};
            if(onConfirm)onConfirm(snapshot,masked);
            else await onSave({...snapshot,prepared:await compressVerifiedPhoto(masked,photo.prepared)});
          } catch (e) {
            setError((e as Error).message || "Enregistrement impossible. Réessayez.");
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        {saving ? "Enregistrement…" : editing ? "Enregistrer la photo" : "Photo vérifiée"}
      </button>
    </Modal>
  );
}
