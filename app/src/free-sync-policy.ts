import { photoDataUrl } from "./photo-input";
import type { Op, Place } from "./types";
export const FREE_SERVER = "firebase-spark-v1";
export const FREE_DAILY_READS = 50;
export const FREE_DAY = 24 * 60 * 60 * 1000;
export interface FreeQueueItem {
  id: string; owner: string; operation: Op; base?: Place; created: number;
  status: "pending" | "error"; error?: string; retryAt?: number;
}
export interface FreeCursor { time: number; id: string; seconds?: number; nanoseconds?: number }
export interface FreeSyncMeta {
  day: number; reads: number; last: number; pausedUntil: number; nextAttempt: number;
  failures: number; zones: Record<string, { cursor: FreeCursor | null; next: number; visited: number }>;
}
export const initialFreeSyncMeta = (): FreeSyncMeta => ({ day: 0, reads: 0, last: 0, pausedUntil: 0, nextAttempt: 0, failures: 0, zones: {} });
export function freeFailure(error: unknown, now: number, failures: number, jitter = Math.random()): { pause: number; retry: number; permanent: boolean } {
  const code = String((error as { code?: string; status?: number })?.code || (error as { status?: number })?.status || "");
  if (/resource-exhausted|quota|429/.test(code)) return { pause: now + FREE_DAY + jitter * 3600000, retry: 0, permanent: false };
  if (/permission-denied|invalid-argument|failed-precondition|already-exists|free\/storage-full|free\/conflict|free\/blocked|free\/unverified|free\/invalid|free\/preview-limit|409|403|400/.test(code)) return { pause: 0, retry: 0, permanent: true };
  return { pause: 0, retry: now + Math.min(FREE_DAY, 60000 * 2 ** Math.min(failures, 10)) + jitter * 60000, permanent: false };
}
// Only the new operation is shareable. Signing in never walks old personal history.
export function shareableFreeOperation(op: Op, base: Place | undefined, current: Place | undefined): Op | null {
  if (!["place.create", "place.edit", "place.delete", "place.validate", "review.save", "review.delete", "photo.add", "photo.delete"].includes(op.kind)) return null;
  if (!base && op.kind !== "place.create") return null;
  if (op.kind === "place.edit") {
    const payload = Object.fromEntries(Object.entries(op.payload).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current?.[key as keyof Place])));
    if (!Object.keys(payload).length) return null;
    return { ...op, payload };
  }
  if (op.kind === "photo.add") {
    const base64 = String(op.payload.base64 || "");
    if (photoDataUrl(base64).length > 53359) return null;
    return { ...op, payload: { ...op.payload, base64: base64.startsWith("data:") ? base64 : photoDataUrl(base64) } };
  }
  if (op.kind === "photo.delete") return { ...op, payload: { id: op.payload.photo_id } };
  return op;
}

// Les opérations d’un même lieu attendent ensemble pour préserver leur ordre.
export function nextQueueAttempt(items: FreeQueueItem[], now: number): number {
  const places = new Map<string, {error:boolean; pending:boolean; at:number}>();
  for(const item of items){
    const group=places.get(item.operation.place_id)||{error:false,pending:false,at:0};
    group.error ||= item.status==='error'; group.pending ||= item.status==='pending';
    group.at=Math.max(group.at,Number.isFinite(item.retryAt) ? item.retryAt! : 0);
    places.set(item.operation.place_id,group);
  }
  const candidates=[...places.values()].filter(g=>g.pending&&!g.error).map(g=>Math.max(now,g.at));
  return candidates.length ? Math.min(...candidates) : 0;
}
