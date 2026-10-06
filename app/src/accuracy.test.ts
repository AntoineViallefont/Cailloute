import { expect, it } from "vitest";
import { accuracyState } from "./accuracy";
import type { Place } from "./types";
const place = {id: "example", information_validated: false} as Place;
it("distingue les données importées non vérifiées d’une correction demandée", () => {
  expect(accuracyState(place)).toBe("unknown");
  expect(accuracyState({...place, information_validated: undefined})).toBe("unknown");
  expect(accuracyState({...place, validation_changed_at: "invalid"})).toBe("unknown");
  expect(accuracyState({...place, information_validated: true})).toBe("valid");
  expect(accuracyState({...place, validation_changed_at: "2026-09-16T10:00:00Z"})).toBe("correction");
});
it("ne présente pas un groupe partiellement vérifié comme incorrect ou entièrement validé", () => {
  const valid = {...place, information_validated: true, validated_at: "2026-09-16T10:00:00Z"};
  const correction = {...place, validation_changed_at: "2026-09-16T10:00:00Z"};
  expect(accuracyState({...correction, merged_members: [valid, place]})).toBe("unknown");
  expect(accuracyState({...place, merged_members: [valid, valid]})).toBe("valid");
  expect(accuracyState({...place, merged_members: [valid, correction]})).toBe("correction");
});
