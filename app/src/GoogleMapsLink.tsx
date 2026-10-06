import { ExternalLink } from "lucide-react";
import type { Place } from "./types";
import { googleMapsSearch } from "./google-maps";

export function GoogleMapsLink({ place }: { place: Place }) {
  return (
    <a
      className="gmaps-link"
      href={googleMapsSearch(place)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GMaps : chercher les avis et photos de ce lieu"
    >
      GMaps <ExternalLink size={13} />
    </a>
  );
}
