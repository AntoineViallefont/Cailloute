import { distance } from "./geo";
import type { Place } from "./types";
export interface LivePosition { lat: number; lon: number; accuracy: number; timestamp: number }
export const nearbyPromptKey = (id: string) => `nearby-prompt-v1:${id}`;
export const nearbySettingsEvent = "nearby-suggestions-changed";
const preferenceKey = "nearby-suggestions-enabled-v1";
const historyKey = "nearby-suggestions-history-v1";
const day = 24 * 60 * 60 * 1000;
type PromptStorage = Pick<Storage, "getItem" | "setItem">;
export function suggestionsEnabled(storage: PromptStorage = localStorage) {
  try { return storage.getItem(preferenceKey) !== "false"; } catch { return false; }
}
export function setSuggestionsEnabled(enabled: boolean) {
  localStorage.setItem(preferenceKey, String(enabled));
  window.dispatchEvent(new Event(nearbySettingsEvent));
}
export function canSuggest(ids: string[], now = Date.now(), storage: PromptStorage = localStorage) {
  try {
    if (!suggestionsEnabled(storage) || ids.some(id => storage.getItem(nearbyPromptKey(id)))) return false;
    const history: unknown = JSON.parse(storage.getItem(historyKey) || "[]");
    if (!Array.isArray(history) || history.some(t => typeof t !== "number" || !Number.isFinite(t))) return false;
    return !history.some(t => t > now - day) && history.filter(t => t > now - 7 * day).length < 3;
  } catch { return false; }
}
export function claimSuggestion(ids: string[], now = Date.now(), storage: PromptStorage = localStorage) {
  if (!canSuggest(ids, now, storage)) return false;
  try {
    const history: number[] = JSON.parse(storage.getItem(historyKey) || "[]");
    storage.setItem(historyKey, JSON.stringify([...history.filter(t => t > now - 7 * day), now]));
    ids.forEach(id => storage.setItem(nearbyPromptKey(id), "shown"));
    return true;
  } catch { return false; }
}
export function rememberContribution(id: string, kind: string) {
  if (!["place.create", "place.edit", "place.validate", "review.save", "photo.add"].includes(kind)) return;
  try {
    localStorage.setItem(nearbyPromptKey(id), "contributed");
    window.dispatchEvent(new Event(nearbySettingsEvent));
  } catch { /* Ne pas bloquer une contribution si le stockage est indisponible. */ }
}
export function isImmediatelyNearby(place: Pick<Place, "lat" | "lon">, position: LivePosition, now = Date.now()) {
  return [position.lat, position.lon, position.accuracy, position.timestamp].every(Number.isFinite) &&
    position.accuracy >= 0 && position.accuracy <= 25 &&
    now >= position.timestamp && now - position.timestamp <= 120000 &&
    distance(place, position) + position.accuracy <= 50;
}
