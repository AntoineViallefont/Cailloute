import { uniqueReviewDetail } from "./latest-reviews";
import { photoDataUrl } from "./photo-input";
import { inFrance } from "./france";
import type { Detail, Op, Photo, Place, Review } from "./types";
import { distance } from "./geo";
import { websiteUrl } from "./place-rules";
import { LYON, categories } from "./types";

export const PERSONAL_ID = "personal-device";
export const personalMode = import.meta.env.VITE_PERSONAL_MODE !== "false";
export interface PersonalPlace {
  id: string;
  base: Place;
  patch: Partial<Place>;
  review?: Review;
  removedReviews: string[];
  photos: Photo[];
  removedPhotos: string[];
  updated: string;
  createdLocally?: boolean;
  informationEditedAt?: string;
}

export function resolvePersonalId(
  id: string,
  places: Map<string, Place>,
): string {
  const visited = new Set<string>();
  while (places.get(id)?.redirect && !visited.has(id)) {
    visited.add(id);
    id = places.get(id)!.redirect!;
  }
  return id;
}

// Une fusion ultérieure de deux sources conserve aussi les notes personnelles.
export function canonicalPersonal(
  places: Place[],
  changes: PersonalPlace[],
): PersonalPlace[] {
  const source = new Map(places.map((p) => [p.id, p]));
  const result = new Map<string, PersonalPlace>();
  for (const c of [...changes].sort((a, b) =>
    a.updated.localeCompare(b.updated),
  )) {
    const id = resolvePersonalId(c.id, source);
    const previous = result.get(id);
    const removedReviews = [
      ...new Set([...(previous?.removedReviews || []), ...c.removedReviews]),
    ];
    const removedPhotos = [
      ...new Set([...(previous?.removedPhotos || []), ...c.removedPhotos]),
    ];
    const photos = new Map(
      [...(previous?.photos || []), ...c.photos].map((p) => [p.id, p]),
    );
    const review = c.review || previous?.review;
    result.set(id, {
      ...c,
      id,
      base: source.get(id) || c.base,
      patch: { ...previous?.patch, ...c.patch },
      createdLocally: c.createdLocally || previous?.createdLocally,
      informationEditedAt:
        c.informationEditedAt || previous?.informationEditedAt,
      removedReviews,
      removedPhotos,
      review:
        review && !removedReviews.includes(review.id) ? review : undefined,
      photos: [...photos.values()].filter((p) => !removedPhotos.includes(p.id)),
    });
  }
  return [...result.values()];
}

// Les corrections restent séparées des imports : seuls les champs modifiés
// prennent la priorité, y compris une valeur effacée ou un lieu supprimé.
export function mergePersonal(
  places: Place[],
  changes: PersonalPlace[],
  details: Detail[] = [],
  actorId?: string,
): Place[] {
  const cachedById = new Map(details.map((d) => [d.id, d]));
  const result = new Map(places.map((p) => [p.id, {...p, photo_count: cachedById.has(p.id)?Math.max(cachedById.get(p.id)?.photo_count||0,cachedById.get(p.id)?.photos.length||0):p.photo_count??0}]));
  for (const c of canonicalPersonal(places, changes)) {
    const base = result.get(c.id) || c.base;
    const cached = cachedById.get(c.id);
    const removed = (cached?.reviews || []).filter(
      (r) => c.removedReviews.includes(r.id) || r.user_id === PERSONAL_ID || (!!c.review && !!actorId && r.user_id === actorId),
    );
    const count =
      Math.max(0, base.review_count - removed.length) + (c.review ? 1 : 0);
    const total =
      (base.rating ?? 0) * base.review_count -
      removed.reduce((sum, r) => sum + r.stars, 0) +
      (c.review?.stars || 0);
    result.set(c.id, {
      ...base,
      ...c.patch,
      id: c.id,
      personal_edited: !!(c.createdLocally || c.informationEditedAt || Object.keys(c.patch).some(key=>!["verified_at","verified_by","information_validated","validated_at","validation_changed_at"].includes(key)) || base.personal_edited),
      rating: count ? total / count : null,
      review_count: count,
      photo_count: cached
        ? Math.max(0,Math.max(cached.photo_count||0,cached.photos.length)-c.removedPhotos.filter(id=>cached.photos.some(p=>p.id===id)).length)+c.photos.filter(p=>!c.removedPhotos.includes(p.id)&&!cached.photos.some(old=>old.id===p.id)).length
        : Math.max(0, (base.photo_count || 0) - c.removedPhotos.length) + c.photos.filter((p) => !c.removedPhotos.includes(p.id)).length,
    });
  }
  return [...result.values()];
}

export function personalDetail(base: Detail, change?: PersonalPlace, actorId?: string): Detail {
  if (!change) return uniqueReviewDetail(base, actorId);
  const reviews = base.reviews.filter(
    (r) => !change.removedReviews.includes(r.id) && r.user_id !== PERSONAL_ID && !(change.review && actorId && r.user_id === actorId),
  );
  if (change.review) reviews.push(change.review);
  const merged = mergePersonal([base], [change], [base], actorId)[0];
  return uniqueReviewDetail({
    ...base,
    ...change.patch,
    reviews,
    photos: [
      ...change.photos,
      ...base.photos.filter((p) => !change.removedPhotos.includes(p.id)),
    ],
    personal_edited: merged.personal_edited,
    rating: merged.rating,
    review_count: merged.review_count,
    photo_count: merged.photo_count,
  },actorId);
}

export function applyPersonal(
  base: Place | undefined,
  previous: PersonalPlace | undefined,
  op: Op,
): PersonalPlace {
  const time = new Date().toISOString();
  const data = op.payload;
  if (!base && op.kind !== "place.create") throw new Error("Lieu introuvable.");
  if (op.kind === "place.create" || op.kind === "place.edit") {
    if (
      typeof data.name !== "string" ||
      data.name.trim().length < 2 ||
      data.name.length > 160
    )
      throw new Error("Indiquez un nom de 2 à 160 caractères.");
    if (
      !(String(data.category) in categories) ||
      !Number.isFinite(data.lat) ||
      !Number.isFinite(data.lon) ||
      !inFrance({ lat: Number(data.lat), lon: Number(data.lon) })
    )
      throw new Error("Choisissez un lieu en France métropolitaine ou en Corse.");
    if (
      data.website &&
      (typeof data.website !== "string" || !websiteUrl(data.website))
    )
      throw new Error("Lien web invalide.");
    if (op.kind === "place.create" && base)
      throw new Error("Ce lieu existe déjà.");
  }
  const initial =
    base ||
    ({
      ...data,
      id: op.place_id,
      version: 1,
      sources: [],
      rating: null,
      review_count: 0,
      community: true,
    } as unknown as Place);
  const c: PersonalPlace = structuredClone(
    previous || {
      id: op.place_id,
      base: initial,
      patch: {},
      photos: [],
      removedPhotos: [],
      removedReviews: [],
      updated: time,
    },
  );
  const current = { ...initial, ...c.patch };
  if (op.kind === "place.create" || op.kind === "place.edit") {
    for (const [key, value] of Object.entries(data)) {
      if (value !== current[key as keyof Place])
        (c.patch as Record<string, unknown>)[key] = value;
    }
    if (op.kind === "place.create") c.createdLocally = true;
    c.informationEditedAt = time;
    c.patch.information_validated = true;
    c.patch.validated_at = time;
    c.patch.validation_changed_at = time;
    c.patch.verified_at = time;
    c.patch.verified_by = "Vous";
    if (data.condition !== current.condition)
      c.patch.condition_observed_at = time;
  } else if (op.kind === "place.validate") {
    if (typeof data.value !== "boolean")
      throw new Error("Validation invalide.");
    c.patch.information_validated = data.value;
    c.patch.validation_changed_at = time;
    if (data.value) c.patch.validated_at = time;
  } else if (op.kind === "place.delete") {
    c.patch.deleted = true;
  } else if (op.kind === "place.restore") {
    c.patch.deleted = false;
  } else if (op.kind === "review.save") {
    if (
      !Number.isInteger(data.stars) ||
      Number(data.stars) < 1 ||
      Number(data.stars) > 5 ||
      typeof data.text !== "string" ||
      data.text.length > 3000
    )
      throw new Error("Vérifiez la note et le commentaire.");
    c.review = {
      id: c.review?.id || op.id,
      user_id: PERSONAL_ID,
      author: "Vous",
      stars: Number(data.stars),
      text: data.text,
      created: c.review?.created || time,
      updated: time,
      votes: 0,
      voters: [],
    };
  } else if (op.kind === "review.delete") {
    if (c.review?.id === data.review_id) delete c.review;
    c.removedReviews.push(String(data.review_id));
  } else if (op.kind === "photo.add") {
    if (
      typeof data.base64 !== "string" ||
      data.base64.length > 3500000 ||
      !/^[A-Za-z0-9+/]+=*$/.test(data.base64)
    )
      throw new Error("Photo invalide ou trop volumineuse.");
    c.photos.push({
      id: op.id,
      user_id: PERSONAL_ID,
      url: photoDataUrl(data.base64),
      caption: String(data.caption || ""),
      created: time,
    });
  } else if (op.kind === "photo.delete") {
    c.photos = c.photos.filter((p) => p.id !== data.photo_id);
    c.removedPhotos.push(String(data.photo_id));
  } else {
    throw new Error("Cette action nécessite le mode collaboratif.");
  }
  c.updated = time;
  return c;
}
