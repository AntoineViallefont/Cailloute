export interface BlockedPerson { id: string; username: string }
export const blockKey = (server: string, id?: string) => `blocked-v2:${server}:${id || "guest"}`;
export function readBlocks(key: string): BlockedPerson[] {
  try { const data = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(data) ? data.filter(p => typeof p?.id === "string" && typeof p.username === "string") : []; }
  catch { return []; }
}
export function cacheBlocks(key: string, entries: BlockedPerson[]) {
  localStorage.setItem(key, JSON.stringify([...new Map(entries.map(p => [p.id, p])).values()]));
  window.dispatchEvent(new Event("blocked-users-changed"));
}
