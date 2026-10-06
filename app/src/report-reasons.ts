export const reportReasons = [
  ["harassment", "Insultes ou harcèlement"],
  ["discrimination", "Haine ou discrimination"],
  ["spam", "Publicité ou spam"],
  ["privacy", "Données privées ou personne identifiable"],
  ["inappropriate", "Contenu inapproprié"],
  ["other", "Autre problème"],
] as const;
export const sanctionLabels: Record<string, string> = { warning: "Avertissement", suspend_7: "Suspension de 7 jours", suspend_30: "Suspension de 30 jours", ban: "Exclusion des contributions", restore: "Contributions rétablies", dismiss: "Rejeter le signalement" };
