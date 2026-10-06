import { frenchLabel } from "./french-labels";
import clothingCatalog from "./clothing-catalog.json";
import foodCatalog from "./food-catalog.json";
import { singular, transitLabels, type Place, type TransitMode } from "./types";
export const allowedModes = (p: Place): TransitMode[] =>
  (p.transit_modes || []).filter((m) => Object.hasOwn(transitLabels,m));
export const protectedPlace = (p: Place) => !!(p.community || p.id?.startsWith("c_") || p.personal_edited || p.verified_by === "Vous");
// Compatibilité avec les contributions et favoris déjà enregistrés.
export function normalizePlace<T extends Place>(p: T): T {
  if(protectedPlace(p))return p;
  p = { ...p, name: frenchLabel(p.name), description: frenchLabel(p.description), activity_type: p.activity_type ? frenchLabel(p.activity_type) : p.activity_type };
  if (p.id === "p_017_hfme" && p.pediatric === undefined)
    p = { ...p, pediatric: true };
  const clothing = (
    clothingCatalog as Record<string, { name: string; url: string }>
  )[p.id];
  if (clothing && ["baby_shop", "food_shop"].includes(p.category)) {
    p = {
      ...p,
      children_clothes: p.children_clothes ?? true,
      sources: [
        ...(p.sources || []).filter((s) => s.key !== "clothing:" + p.id),
        {
          key: "clothing:" + p.id,
          name: clothing.name + " · rayon enfant (indication à valider)",
          url: clothing.url,
          license: "Faits publics et indication utilisateur",
          retrieved_at: "2026-09-15",
        },
      ],
    };
  }
  return p.category === "changing_table"
    ? {
        ...p,
        category: "toilet",
        changing_table: true,
        toilets_available: p.toilets_available ?? null,
      }
    : p;
}
export const placeLabel = (p: Place) =>
  p.category === "transit"
    ? allowedModes(p)
        .map((m) => transitLabels[m])
        .join(" · ") || "Transport · mode non renseigné"
    : p.category === "health" && p.health_type
      ? {
          doctor: p.pediatric === true ? "Pédiatre" : "Médecin",
          pharmacy: "Pharmacie",
          emergency:
            p.pediatric === true ? "Urgences pédiatriques" : "Urgences",
        }[p.health_type]
      : singular[p.category];

export function websiteUrl(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const raw = value.trim();
    if (/\s/.test(raw) || (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw))) return null;
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname.includes(".") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Les stocks ne sont pas connus : une confirmation personnelle prime sur le classement initial.
export function familyFoodShop(p: Place) {
  if (p.category !== "food_shop") return true;
  if (p.baby_food != null) return p.baby_food;
  if (p.community || p.id.startsWith("c_")) return true;
  const type = p.shop_type || (foodCatalog as Record<string, string>)[p.id];
  if (type === "supermarket") return true;
  if (p.organic === true && ["health_food", "greengrocer", "convenience"].includes(type || "")) return true;
  return (
    type === "convenience" &&
    /\b(carrefour|casino|vival|spar|monop|franprix|auchan|intermarch[eé]|u express|super u|lidl|aldi|coccinelle|coccimarket|proxy|proxi|netto)\b/i.test(
      p.name,
    )
  );
}

export function visibleFamilyPlace(p: Place) {
  if (p.category === "health" && p.health_type === "doctor")
    return p.pediatric === true;
  return p.children_clothes === true || familyFoodShop(p);
}
export function categoryMatches(p: Place, selected: Place["category"][]) {
  if (p.category === "other")
    return (
      selected.includes("other") ||
      [
        "health",
        "child_activity",
        "playground",
        "toilet",
        "water",
        "baby_shop",
        "food_shop",
        "transit",
      ].every((c) => selected.includes(c as Place["category"]))
    );
  const food =
    (p.category === "food_shop" && familyFoodShop(p)) ||
    (p.category === "baby_shop" && p.baby_food === true);
  const baby =
    p.category === "baby_shop" ||
    (p.category === "food_shop" && p.children_clothes === true);
  if (p.category === "food_shop" || p.category === "baby_shop")
    return (
      (food && selected.includes("food_shop")) ||
      (baby && selected.includes("baby_shop"))
    );
  return selected.includes(p.category);
}
