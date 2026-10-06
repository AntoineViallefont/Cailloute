import type { Place } from "./types";

type GooglePlace = Pick<
  Place,
  "id" | "name" | "address" | "city" | "lat" | "lon"
>;
export function googleMapsSearch(place: GooglePlace) {
  const address = [place.address, place.city]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(", ");
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set(
    "query",
    place.address?.trim()
      ? [place.name, address].filter(Boolean).join(", ")
      : `${place.lat},${place.lon}`,
  );
  return url.toString();
}
