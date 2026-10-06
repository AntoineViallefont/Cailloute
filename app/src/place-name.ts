import { singular, type Place } from "./types";
type NameInput = Pick<Place, "category" | "lat" | "lon"> &
  Partial<Pick<Place, "name" | "health_type" | "activity_type">>;
export function placeTypeName(place: NameInput) {
  if (place.category === "health" && place.health_type)
    return { doctor: "Pédiatre", pharmacy: "Pharmacie", emergency: "Urgences" }[
      place.health_type
    ];
  if (place.category === "child_activity" && place.activity_type?.trim())
    return place.activity_type.trim();
  return singular[place.category];
}
function streetAddress(data: {
  features?: { properties?: Record<string, unknown> }[];
}) {
  const p = data.features?.[0]?.properties;
  if (!p || !["housenumber", "street"].includes(String(p.type))) return "";
  const text = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const street = text(p.street) || (p.type === "street" ? text(p.name) : "");
  return street ? [text(p.housenumber), street].filter(Boolean).join(" ") : "";
}
export async function automaticPlaceName(place: NameInput): Promise<string> {
  if (place.name?.trim()) return place.name.trim();
  const type = placeTypeName(place);
  if (
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon) ||
    Math.abs(place.lat) > 90 ||
    Math.abs(place.lon) > 180
  )
    return type;
  // Une adresse à proximité nomme le lieu sans déplacer son point GPS.
  const signal = AbortSignal.timeout(5000);
  try {
    for (const level of ["housenumber", "street"]) {
      const params = new URLSearchParams({
        lat: String(place.lat),
        lon: String(place.lon),
        index: "address",
        type: level,
        limit: "1",
      });
      const response = await fetch(
        "https://data.geopf.fr/geocodage/reverse?" + params,
        { signal },
      );
      if (!response.ok) return type;
      const address = streetAddress(await response.json());
      if (address) return `${type} · ${address}`.slice(0, 160);
    }
  } catch {
    /* Hors ligne : conserver la création et ne pas inventer d'adresse. */
  }
  return type;
}
