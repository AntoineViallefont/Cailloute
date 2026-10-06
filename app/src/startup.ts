let painted = false;
let revealed = false;
const pending = new Set<unknown>();
const waiting = new Set<() => void>();
export function launchRevealed() { return revealed; }
export function markLaunchRevealed() { revealed = true; }
export function mapLoading(layer: unknown) { pending.add(layer); }
export function mapPainted(layer?: unknown) {
  if (layer !== undefined) pending.delete(layer);
  if (!painted) performance.mark("cailloute:map-painted");
  painted = true;
  if (!pending.size) for (const done of [...waiting]) done();
}
export function mapSettled() { return painted && pending.size === 0; }
// Les erreurs de tuiles terminent aussi leur chargement : le cache reste accessible.
export function waitForMap(timeout?: number): Promise<void> {
  if (mapSettled()) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); waiting.delete(done); resolve(); };
    const timer = timeout == null ? undefined : setTimeout(done, timeout);
    waiting.add(done);
  });
}
export async function waitForStableMap(timeout=8000): Promise<void> {
  const deadline=Date.now()+timeout;
  do {
    await waitForMap(Math.max(0,deadline-Date.now()));
    if(Date.now()>=deadline)return;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  } while (!mapSettled());
}
