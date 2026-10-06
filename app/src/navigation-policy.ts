export function travelModes(pmr: boolean) {
  return pmr
    ? ["walking", "transit", "driving"]
    : ["walking", "bicycling", "transit", "driving"];
}

// Aucun lien public vérifié ne transmet aujourd'hui la contrainte PMR.
// Ne jamais réutiliser un choix « Toujours » pour contourner cette étape.
export function needsPmrPlanner(pmr: boolean, mode: string) {
  return pmr && mode === "transit";
}

export function tclDestination(place: {
  address?: string;
  city?: string;
  lat: number;
  lon: number;
}) {
  return place.address?.trim()
    ? [place.address.trim(), place.city?.trim()].filter(Boolean).join(", ")
    : `${place.lat}, ${place.lon}`;
}
