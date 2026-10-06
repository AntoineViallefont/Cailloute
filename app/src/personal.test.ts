import { describe, expect, it } from "vitest";
import {
  applyPersonal,
  canonicalPersonal,
  mergePersonal,
  personalDetail,
  PERSONAL_ID,
} from "./personal";
import type { Op, Place } from "./types";
const place: Place = {
  id: "water-1",
  version: 3,
  name: "Fontaine",
  category: "water",
  lat: 45.7578,
  lon: 4.832,
  address: "Place Bellecour",
  city: "Lyon",
  hours: "",
  description: "Ancien texte",
  age: "",
  access: "public",
  wheelchair: null,
  changing_table: null,
  drinking_water: true,
  free: true,
  fenced: null,
  elevator: null,
  sources: [],
  rating: null,
  review_count: 0,
};
const op = (kind: string, payload: Record<string, unknown> = {}): Op => ({
  id: crypto.randomUUID(),
  place_id: place.id,
  kind,
  payload,
});
describe("Mode personnel, sans compte", () => {
  it("conserve la fiche et les avis personnels après une fusion ultérieure des sources", () => {
    const edit = applyPersonal(
      place,
      undefined,
      op("place.edit", { ...place, drinking_water: false }),
    );
    const review = applyPersonal(
      place,
      edit,
      op("review.save", { stars: 2, text: "Robinet fermé" }),
    );
    const merged = { ...place, id: "canonical-water", version: 10 };
    const sources = [
      { ...place, redirect: "alias-water" },
      { ...place, id: "alias-water", redirect: merged.id },
      merged,
    ];
    const changes = canonicalPersonal(sources, [review]);
    expect(changes[0].id).toBe(merged.id);
    expect(
      mergePersonal(sources, [review]).find((p) => p.id === merged.id)
        ?.drinking_water,
    ).toBe(false);
    expect(
      personalDetail({ ...merged, reviews: [], photos: [] }, changes[0]),
    ).toMatchObject({ rating: 2, drinking_water: false });
    const deleted = applyPersonal(merged, changes[0], {
      ...op("place.delete"),
      place_id: merged.id,
    });
    expect(
      mergePersonal(sources, [deleted]).find((p) => p.id === merged.id)
        ?.deleted,
    ).toBe(true);
  });
  it("conserve une correction et un champ effacé tout en recevant les autres mises à jour", () => {
    const edit = applyPersonal(
      place,
      undefined,
      op("place.edit", { ...place, description: "", drinking_water: false }),
    );
    const fresh = {
      ...place,
      version: 4,
      name: "Nom actualisé par la commune",
      hours: "24/7",
    };
    expect(mergePersonal([fresh], [edit])[0]).toMatchObject({
      name: fresh.name,
      hours: "24/7",
      description: "",
      drinking_water: false,
      version: 4,
    });
    expect(place.description).toBe("Ancien texte");
  });
  it("maintient une suppression après réimport et permet la restauration", () => {
    const deleted = applyPersonal(place, undefined, op("place.delete"));
    expect(
      mergePersonal([{ ...place, version: 9 }], [deleted])[0].deleted,
    ).toBe(true);
    const restored = applyPersonal(place, deleted, op("place.restore"));
    expect(mergePersonal([place], [restored])[0].deleted).toBe(false);
    expect(deleted.patch.deleted).toBe(true);
  });
  it("conserve un lieu créé même si un import remplace tous les lieux sources", () => {
    const created = applyPersonal(
      undefined,
      undefined,
      op("place.create", { ...place }),
    );
    expect(mergePersonal([], [created])[0].name).toBe("Fontaine");
  });
  it("permet l’ajout, la modification et la suppression d’un avis personnel", () => {
    const first = applyPersonal(
      place,
      undefined,
      op("review.save", { stars: 4, text: "Accessible" }),
    );
    const second = applyPersonal(
      place,
      first,
      op("review.save", { stars: 3, text: "À vérifier" }),
    );
    const detail = personalDetail(
      { ...place, reviews: [], photos: [] },
      second,
    );
    expect(detail).toMatchObject({ rating: 3, review_count: 1 });
    expect(detail.reviews[0]).toMatchObject({
      user_id: PERSONAL_ID,
      id: first.review!.id,
      created: first.review!.created,
    });
    const removed = applyPersonal(
      place,
      second,
      op("review.delete", { review_id: second.review!.id }),
    );
    expect(
      personalDetail({ ...place, reviews: [], photos: [] }, removed).reviews,
    ).toHaveLength(0);
  });
  it("supprime une photo et conserve la suppression d’un contenu importé", () => {
    const added = applyPersonal(
      place,
      undefined,
      op("photo.add", { base64: "aW1hZ2U=" }),
    );
    const removed = applyPersonal(
      place,
      added,
      op("photo.delete", { photo_id: added.photos[0].id }),
    );
    expect(removed.photos).toHaveLength(0);
    expect(added.photos).toHaveLength(1);
  });
  it("refuse les coordonnées hors périmètre et les notes invalides", () => {
    expect(() =>
      applyPersonal(
        place,
        undefined,
        op("place.edit", { ...place, lat: 51.5074, lon: -0.1278 }),
      ),
    ).toThrow(/France métropolitaine/);
    expect(() =>
      applyPersonal(
        place,
        undefined,
        op("review.save", { stars: 0, text: "" }),
      ),
    ).toThrow();
  });
});

it("valide les créations et corrections tout en permettant une invalidation explicite", () => {
  const valid = applyPersonal(
    place,
    undefined,
    op("place.validate", { value: true }),
  );
  expect(valid.patch.information_validated).toBe(true);
  expect(valid.patch.validated_at).toBeTruthy();
  const invalid = applyPersonal(
    place,
    valid,
    op("place.validate", { value: false }),
  );
  expect(invalid.patch).toMatchObject({
    information_validated: false,
    validated_at: valid.patch.validated_at,
  });
  const edited = applyPersonal(
    place,
    valid,
    op("place.edit", { ...place, description: "Nouvelle précision" }),
  );
  expect(edited.patch.information_validated).toBe(true);
  expect(edited.patch.validated_at).toBe(edited.patch.validation_changed_at);
  const created = applyPersonal(
    undefined,
    undefined,
    op("place.create", { ...place }),
  );
  expect(created.patch.information_validated).toBe(true);
  expect(created.patch.validated_at).toBeTruthy();
  expect(place.description).toBe("Ancien texte");
  expect(() =>
    applyPersonal(place, valid, op("place.validate", { value: "true" })),
  ).toThrow();
});
it("affiche la note personnelle dans la liste et la fiche, y compris après modification et suppression", () => {
  const review = applyPersonal(
    place,
    undefined,
    op("review.save", { stars: 4, text: "Bien" }),
  );
  expect(mergePersonal([place], [review])[0]).toMatchObject({
    rating: 4,
    review_count: 1,
  });
  const revised = applyPersonal(
    place,
    review,
    op("review.save", { stars: 2, text: "Corrigé" }),
  );
  expect(mergePersonal([place], [revised])[0]).toMatchObject({
    rating: 2,
    review_count: 1,
  });
  const deleted = applyPersonal(
    place,
    revised,
    op("review.delete", { review_id: revised.review!.id }),
  );
  expect(mergePersonal([place], [deleted])[0]).toMatchObject({
    rating: null,
    review_count: 0,
  });
});
it("conserve les notes publiques lorsqu'on valide une fiche sans avis téléchargés", () => {
  const base = { ...place, rating: 3, review_count: 2 };
  const valid = applyPersonal(
    base,
    undefined,
    op("place.validate", { value: true }),
  );
  expect(
    personalDetail({ ...base, reviews: [], photos: [] }, valid),
  ).toMatchObject({ rating: 3, review_count: 2 });
});

it("conserve plus de vingt photos sur un même lieu",()=>{
  let change;
  for(let i=0;i<25;i++)change=applyPersonal(place,change,op("photo.add",{base64:"YQ==",caption:`Photo ${i}`}));
  expect(change!.photos).toHaveLength(25);
});
