export function rainLevel(
  mm: number | null | undefined,
  probability: number | null | undefined,
) {
  if (mm == null || probability == null) return "unknown";
  if (mm < 0.1 || probability < 30) return "green";
  return mm >= 8 ? "red" : mm >= 4 ? "orange" : "yellow";
}
export const rainLabel = {
  unknown: "Pluie non renseignée",
  green: "Risque de pluie faible",
  yellow: "Pluie faible",
  orange: "Pluie modérée",
  red: "Pluie forte / soutenue",
};
export const rainNumber = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
