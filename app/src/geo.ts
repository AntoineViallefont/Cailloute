import { matchesAgeBand,matchesChildAge } from "./playground-age";
import {
  allowedModes,
  categoryMatches,
  visibleFamilyPlace,
} from "./place-rules";
import opening_hours from "opening_hours";
import type { Place, Origin, Category, TransitMode } from "./types";
export function distance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742017.6 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function distanceLabel(m: number) {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}
export type PriceFilter = "free" | "paid" | "unknown";
export const allPrices: PriceFilter[] = ["free", "paid", "unknown"];
export function selectedPrices(filters: Pick<Filters, "price" | "prices">): PriceFilter[] {
  return filters.prices ?? (!filters.price || filters.price === "all" ? allPrices : [filters.price]);
}
export interface Filters {
  categories: Category[];
  childAge?: number | null;
  ageBand?: string | null;
  includeUnknownAge?: boolean;
  unknownTransit?: boolean;
  changing: boolean;
  open: boolean;
  radius: number;
  pmr: boolean;
  transitModes: TransitMode[];
  publicToilets: boolean;
  organic: boolean;
  minRating: number;
  recentlyValidated: boolean;
  withPhotos: boolean;
  healthTypes?: string[];
  price?: "all" | "free" | "paid" | "unknown"; // Lecture des anciens réglages.
  prices?: PriceFilter[];
}
export const defaults: Filters = {
  categories: [
    "health",
    "child_activity",
    "playground",
    "toilet",
    "water",
    "baby_shop",
    "food_shop",
    "transit",
  ],
  childAge: null,
  ageBand: null,
  includeUnknownAge: false,
  price: "all",
  changing: false,
  open: false,
  radius: 10000,
  pmr: false,
  transitModes: ["metro", "tram", "bus", "train", "ferry", "cable"],
  unknownTransit: true,
  publicToilets: false,
  organic: false,
  minRating: 0,
  recentlyValidated: false,
  withPhotos: false,
  healthTypes: ["doctor", "pharmacy", "emergency"],
};
export function isOpen(p: Place, at = new Date()): boolean | null {
  if (["temporary_closed", "unavailable"].includes(p.condition || ""))
    return false;
  if (!p.hours?.trim()) return null;
  try {
    const h = new opening_hours(p.hours, {
      lat: p.lat,
      lon: p.lon,
      address: { country_code: "fr", state: "" },
    });
    return h.getUnknown(at) ? null : h.getState(at);
  } catch {
    return null;
  }
}
export function matchesOpeningHours(p: Place) {
  const state = isOpen(p);
  // Absence d'horaires : présumé ouvert pour le filtre, sans inventer d'horaires.
  return (
    state === true ||
    (state === null &&
      !p.hours?.trim() &&
      !p.hours_variants?.some((hours) => hours.trim()))
  );
}
export function recentlyValidated(p: Place, now = Date.now()) {
  const stamp = Date.parse(p.validated_at || "");
  const yearAgo = new Date(now);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  return p.information_validated === true && Number.isFinite(stamp) && stamp <= now && stamp > yearAgo.getTime();
}
export function matches(p: Place, f: Filters, origin: Origin) {
  return (
    distance(p,origin)<=f.radius &&
    selectedPrices(f).includes(p.free === true ? "free" : p.free === false ? "paid" : "unknown") &&
    !p.deleted &&
    !p.redirect &&
    !p.withdrawn &&
    visibleFamilyPlace(p) &&
    categoryMatches(p, f.categories) &&
    (p.category !== "health" ||
      (f.healthTypes || defaults.healthTypes!).includes(p.health_type || "") ||
      (!p.health_type &&
        (f.healthTypes || defaults.healthTypes!).length === 3)) &&
    (p.category !== "transit" ||
      (allowedModes(p).length?allowedModes(p).some((m) => f.transitModes.includes(m)):f.unknownTransit !== false)) &&
    (!["playground","child_activity"].includes(p.category) || (f.ageBand ? matchesAgeBand(p.age,f.ageBand,false) : matchesChildAge(p.age,f.childAge,false))) &&
    (!f.pmr || p.wheelchair === true) &&
    (p.category !== "water" || p.drinking_water === true) &&
    (!f.changing || p.category !== "toilet" || p.changing_table === true) &&
    (!f.publicToilets || p.category !== "toilet" || p.toilet_public === true) &&
    (!f.organic || p.category !== "food_shop" || p.organic === true) &&
    (!f.minRating || (p.review_count > 0 && p.rating !== null && p.rating >= f.minRating)) &&
    (!f.recentlyValidated || recentlyValidated(p)) &&
    (!f.withPhotos || (p.photo_count || 0) > 0) &&
    (!f.open || matchesOpeningHours(p))
  );
}
export function directions(p: Place, mode: string, origin: Origin) {
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", `${p.lat},${p.lon}`);
  u.searchParams.set("travelmode", mode);
  if (origin.chosen)
    u.searchParams.set("origin", `${origin.lat},${origin.lon}`);
  return u.toString();
}
export function level(
  kind: "temperature" | "wind" | "uv" | "aqi",
  v: number | null | undefined,
) {
  if (v == null) return "unknown";
  if (kind === "uv") return v < 3 ? "green" : v < 6 ? "orange" : "red";
  if (kind === "aqi") return v <= 40 ? "green" : v <= 60 ? "orange" : "red";
  if (kind === "wind") return v < 20 ? "green" : v < 40 ? "orange" : "red";
  return v >= 15 && v < 26 ? "green" : v >= 5 && v < 32 ? "orange" : "red";
}

// Échelle logarithmique : la moitié du curseur correspond à environ 2,2 km.
export function radiusFromSlider(value: number) {
  const meters = 100 * 500 ** (Math.max(0, Math.min(1000, value)) / 1000);
  const step = meters < 1000 ? 10 : meters < 5000 ? 50 : meters < 30000 ? 100 : 1000;
  return Math.min(50000, Math.max(100, Math.round(meters / step) * step));
}
export function radiusToSlider(radius: number) {
  return (
    (Math.log(Math.max(100, Math.min(50000, radius)) / 100) / Math.log(500)) *
    1000
  );
}

export function radiusBounds(origin:{lat:number;lon:number},radius:number){
 const radians=Math.min(50000,Math.max(100,radius))/6371008.8,r=Math.PI/180;
 const dy=radians/r,dx=Math.asin(Math.min(1,Math.sin(radians)/Math.cos(origin.lat*r)))/r;
 return {south:origin.lat-dy,north:origin.lat+dy,west:origin.lon-dx,east:origin.lon+dx};
}
export function radiusQueryExtent(radius:number){return [1000,5000,10000,30000,50000].find(n=>n>=radius)||50000;}
