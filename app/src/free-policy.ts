/** Budgets volontaires, inférieurs aux quotas Spark. Aucun service facturé. */
export const FREE_DAILY_READ_BUDGET = 50;
export const FREE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FREE_PAGE_SIZE = 20;
export const FREE_TERMS_VERSION = '2026-09-17';
export const FREE_LIMITS = { added: 5, edited: 10, deleted: 2 } as const;
// Une cellule de 0,25 degré, et les huit voisines : couvre les déplacements usuels.
export function sharedCell(p: { lat: number; lon: number }): string {
  return `${Math.floor(p.lat * 4)}:${Math.floor(p.lon * 4)}`;
}
export function sharedCells(p: { lat: number; lon: number }): string[] {
  const y = Math.floor(p.lat * 4), x = Math.floor(p.lon * 4);
  return [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => `${y + dy}:${x + dx}`));
}
/** Réserves globales également imposées dans firestore.rules. Modifier ensemble après mesure. */
export const FREE_STORAGE_LIMITS = { members: 5000, places: 3000, previews: 10000, previewBytes: 40000 } as const;
