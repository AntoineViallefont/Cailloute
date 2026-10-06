import type { Place } from "./types";

export type AccuracyState = "unknown" | "valid" | "correction";
export function accuracyState(place: Place): AccuracyState {
  if (place.merged_members?.length) {
    const states = place.merged_members.map(accuracyState);
    if (states.includes("correction")) return "correction";
    return states.every(state => state === "valid") ? "valid" : "unknown";
  }
  if (place.information_validated === true) return "valid";
  // Le catalogue initial contient aussi false : sans vérification datée, il reste inconnu.
  return place.information_validated === false &&
    [place.validation_changed_at, place.validated_at].some(stamp => !!stamp && Number.isFinite(Date.parse(stamp)))
    ? "correction" : "unknown";
}
export const accuracyLabels = { unknown: "Valide ?", valid: "Validé", correction: "À corriger" };
