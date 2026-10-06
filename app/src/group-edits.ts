import type { Place } from "./types";
// Seuls les champs changés dans la fiche commune sont répercutés aux membres.
// Les positions originales restent intactes tant que l'utilisateur ne déplace pas le point.
export function changedPlaceFields(initial: Record<string, unknown>, values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(values)
      .filter((key) =>
        ["lat", "lon"].includes(key)
          ? Math.abs(Number(values[key]) - Number(initial[key])) > 1e-9
          : JSON.stringify(values[key]) !== JSON.stringify(initial[key]),
      )
      .map((key) => [key, values[key]]),
  );
}
export function groupEdits(place: Place, initial: Record<string, unknown>, values: Record<string, unknown>) {
  const changed = changedPlaceFields(initial, values);
  return (place.merged_members || [place]).map((member) => ({
    id: member.id,
    version: member.version,
    payload: {
      ...Object.fromEntries(
        Object.keys(values).map((key) => [key, member[key as keyof Place]]),
      ),
      ...changed,
    },
  }));
}
