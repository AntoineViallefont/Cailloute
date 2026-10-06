import { CircleCheck, CircleX, CircleHelp } from "lucide-react";
import type { Place } from "./types";
import { accuracyState, accuracyLabels } from "./accuracy";
export function AccuracyIcon({ place, showLabel = false }: { place: Place; showLabel?: boolean }) {
  const state = accuracyState(place);
  const label = accuracyLabels[state];
  const title = label + (place.validated_at ? " · dernière validation le " + new Date(place.validated_at).toLocaleDateString("fr-FR") : "");
  const Icon = state === "valid" ? CircleCheck : state === "correction" ? CircleX : CircleHelp;
  return <span className={"accuracy-icon accuracy-" + state} role="img" aria-label={title} title={title}><Icon size={20} />{showLabel && <span>{label}</span>}</span>;
}
