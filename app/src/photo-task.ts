export function photoAbort() { return new DOMException("Préparation annulée.", "AbortError"); }
// Les API de décodage/encodage de certaines WebView peuvent ne jamais répondre.
export function photoTask<T>(task: Promise<T>, milliseconds: number, message: string, signal?: AbortSignal, disposeLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown, value?: T) => {
      if (done) { if (!error && value !== undefined) disposeLate?.(value); return; }
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value as T);
    };
    const abort = () => finish(photoAbort());
    const timer = setTimeout(() => finish(new Error(message)), milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
    task.then(value => finish(undefined, value), error => finish(error));
    if (signal?.aborted) abort();
  });
}
export function checkPhotoAbort(signal?: AbortSignal) { if (signal?.aborted) throw photoAbort(); }
