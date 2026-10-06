import type { PhotoMask } from "./photo-masks";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { photoTask } from "./photo-task";
import { photoAbort } from "./photo-task";
export interface HeadDetection { masks: PhotoMask[]; incomplete: boolean }
const nativeFaces = registerPlugin<{warm(): Promise<void>; release(): Promise<void>; detect(options: {base64: string}): Promise<HeadDetection>}>("CaillouteFaces");
let worker: Worker | undefined;
let active = false;
let idle: ReturnType<typeof setTimeout> | undefined;
function release() { worker?.terminate(); worker = undefined; }
// Réutiliser le modèle pour les photos successives ; libérer sa mémoire après le lot.
export function releaseHeadDetector() {
  if (Capacitor.getPlatform() === "android") {
    clearTimeout(idle);
    idle = setTimeout(() => { void nativeFaces.release().catch(() => {}); }, 30000);
    return;
  }
  if (!active) { clearTimeout(idle); release(); }
}
export function warmHeadDetector() {
  if (Capacitor.getPlatform() === "android") { clearTimeout(idle); void nativeFaces.warm().catch(() => {}); return; }
  if (worker) return;
  try {
    worker = new Worker(new URL("./head-detection.worker.ts", import.meta.url), { type: "module" });
    worker.onerror = () => { if (!active) release(); };
    worker.postMessage({id: "warmup"});
    idle = setTimeout(releaseHeadDetector, 30000);
  } catch { release(); }
}
export function detectHeads(blob: Blob, signal?: AbortSignal, progress?: (done: number, total: number) => void, budgetMs = 600): Promise<HeadDetection> {
  if (signal?.aborted) return Promise.reject(photoAbort());
  if (Capacitor.getPlatform() === "android") {
    const task = new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Photo illisible.")); reader.readAsDataURL(blob); }).then(base64 => nativeFaces.detect({base64}));
    return photoTask(task, budgetMs, "Analyse interrompue pour ouvrir la vérification.", signal);
  }
  if (active) return Promise.reject(new Error("Analyse déjà en cours."));
  return new Promise((resolve, reject) => {
    clearTimeout(idle);
    const current = worker ||= new Worker(new URL("./head-detection.worker.ts", import.meta.url), { type: "module" });
    active = true;
    const id = crypto.randomUUID(); let masks: PhotoMask[] = [], finished = false;
    const finish = (incomplete: boolean, error?: unknown, stop = false) => {
      if (finished) return;
      finished = true; active = false; clearTimeout(timeout); signal?.removeEventListener("abort", abort);
      current.onmessage = null; current.onerror = null; current.onmessageerror = null;
      if (stop) release(); else idle = setTimeout(releaseHeadDetector, 30000);
      if (error) reject(error); else resolve({ masks, incomplete });
    };
    const abort = () => finish(true, photoAbort(), true);
    const timeout = setTimeout(() => finish(true, undefined, true), budgetMs);
    signal?.addEventListener("abort", abort, { once: true });
    current.onerror = current.onmessageerror = () => finish(true, undefined, true);
    current.onmessage = (event: MessageEvent<{id: string; masks?: PhotoMask[]; error?: string; progress?: number; total?: number}>) => {
      if (event.data.id !== id) return;
      if (event.data.masks) masks = event.data.masks;
      if (event.data.error) finish(true, undefined, true);
      else if (event.data.progress !== undefined) progress?.(event.data.progress, event.data.total || 1);
      else finish(false);
    };
    try { current.postMessage({ id, blob }); } catch (error) { finish(true, error, true); }
  });
}
