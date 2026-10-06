import {syncAccountBackup} from './account-backup';
import {stored} from "./preferences";
import { uniqueReviewDetail } from "./latest-reviews";
import { prepareCanonicalCatalog } from "./canonical-store";
import { placeSourceIds, type CanonicalGroup, type CatalogSource } from "./canonical-data";
import { offlineMap } from "./map-cache";
import { syncAccountFavorites } from './account-favorites';
export { syncAccountFavorites, waitForFavoriteSync } from './account-favorites';
import { accountDeletionInProgress } from './free-cloud';
import { freeCollaborationEnabled, subscribeFreeSession, getFreeSession } from "./free-cloud";
import { stopAdminLive, runFreeSync, queueFreeOperation, cacheFreePreviews } from "./free-sync";
import type { FreeQueueItem } from "./free-sync-policy";
import { blockKey, cacheBlocks } from "./block-cache";
import { inFrance } from "./france";
import { emptyStats, type ContributionStats } from "./contribution-score";
import { enrichImported } from "./place-enrichment";
import { enrichOpenImported } from './open-enrichment';
import {loadOpenEnrichmentForPlaces} from './open-enrichment-loader';
import { rememberContribution } from "./nearby-prompt";
import { normalizePlace } from "./place-rules";
import Dexie, { type EntityTable, type Table } from "dexie";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import type { Place, Pending, User, Detail, Op } from "./types";
import {
  applyPersonal,
  canonicalPersonal,
  resolvePersonalId,
  mergePersonal,
  personalDetail,
  personalMode,
  type PersonalPlace,
} from "./personal";
import { distance } from "./geo";
import { convertPhotoUrl, photoDataUrl } from "./photo-input";
import { LYON, type Origin } from "./types";
class LocalDB extends Dexie {
  catalogGroups!: Table<CanonicalGroup,string>;
  catalogSources!: Table<CatalogSource,string>;
  sourceRevisions!: Table<Place,string>;
  places!: EntityTable<Place, "id">;
  queue!: EntityTable<Pending, "id">;
  favorites!: EntityTable<{ id: string }, "id">;
  details!: EntityTable<Detail, "id">;
  meta!: EntityTable<{ key: string; value: unknown }, "key">;
  personal!: EntityTable<PersonalPlace, "id">;
  removed!: EntityTable<{ id: string }, "id">;
  freeQueue!: EntityTable<FreeQueueItem, "id">;
  constructor() {
    super("Cailloute");
    this.version(1).stores({
      places: "id,category",
      queue: "id,owner,created",
      favorites: "id",
      details: "id",
      meta: "key",
    });
    this.version(2).stores({ personal: "id,updated" });
    this.version(3).stores({ removed: "id" });
    this.version(4).stores({ freeQueue: "id,owner,created,status" });
    this.version(5).stores({catalogGroups:"id",catalogSources:"id,canonicalId",sourceRevisions:"id"});
    this.version(6).stores({places:"id,category,lat"});
  }
}
export const db = new LocalDB();
export const native = Capacitor.isNativePlatform();
interface QueueBridge {
  configure(o: { url: string; token: string; owner: string }): Promise<void>;
  enqueue(o: {
    operation: string;
    owner: string;
    server: string;
  }): Promise<void>;
  flush(): Promise<void>;
  statuses(): Promise<{
    items: { id: string; status: string; error: string }[];
  }>;
  forget(o: { id: string }): Promise<void>;
  session(): Promise<{ token: string; owner: string }>;
}
const bridge = registerPlugin<QueueBridge>("CaillouteSync");
let bearer = native ? "" : localStorage.getItem("token") || "";
export let user: User | null = stored<User|null>("user",null);
export const apiBase = () =>
  localStorage.getItem("server") ||
  import.meta.env.VITE_API_URL ||
  (native ? "http://127.0.0.1:8787" : "/api");
export const photoUrl = (path: string) =>
  /^data:image\/(jpeg|webp|png);base64,/.test(path) ? path : apiBase() + path;
export interface PlaceBounds {south:number;north:number;west:number;east:number}
export async function allPlaces(bounds?:PlaceBounds,ids?:string[]) {
  const excluded = new Set(ids?(await db.removed.bulkGet(ids)).filter((p):p is {id:string}=>!!p).map(p=>p.id):await db.removed.toCollection().primaryKeys());
  const rows=ids ? (await db.places.bulkGet(ids)).filter((p):p is Place=>!!p) : bounds ? await db.places.where("lat").between(bounds.south,bounds.north,true,true).filter(p=>p.lon>=bounds.west&&p.lon<=bounds.east).toArray() : await db.places.toArray();
  const changeIds=ids?[...new Set([...ids,...rows.flatMap(placeSourceIds)])]:undefined;
  const changes=personalMode?(changeIds?(await db.personal.bulkGet(changeIds)).filter((c):c is PersonalPlace=>!!c):await db.personal.toArray()):[];
  // Les anciennes contributions redirigées sont résolues avant la projection locale.
  const additional=!ids&&changes.length?await personalSources(changes.map(c=>c.id)):[];
  const originals=[...new Map([...rows,...additional].map(p=>[p.id,p])).values()].filter(p=>!excluded.has(p.id));
  await loadOpenEnrichmentForPlaces(originals);
  const places=originals.map(p=>p.catalog_version?enrichOpenImported(p):enrichImported(p));
  const source=new Map(places.map(p=>[p.id,p]));
  const editedIds=[...new Set(changes.map(c=>resolvePersonalId(c.id,source)))];
  // La carte ne charge plus les images de toutes les fiches consultées auparavant.
  const details=(await db.details.bulkGet(editedIds)).filter((d):d is Detail=>!!d);
  return (personalMode ? mergePersonal(places,changes,details,getFreeSession()?.uid) : places)
    .filter(p=>!p.deleted&&!p.redirect&&!p.withdrawn&&!excluded.has(p.id)&&(!bounds||(p.lat>=bounds.south&&p.lat<=bounds.north&&p.lon>=bounds.west&&p.lon<=bounds.east)))
    .map(normalizePlace);
}
/** Lecture locale des seuls favoris, avec résolution de leurs fusions et corrections. */
export async function favoritePlaces():Promise<Place[]> {
  const ids=(await db.favorites.toArray()).map(f=>f.id);
  if(!ids.length)return [];
  const seen=new Set<string>();let pending=ids;
  while(pending.length){
    const keys=[...new Set(pending)].filter(id=>!seen.has(id));
    if(!keys.length)break;
    keys.forEach(id=>seen.add(id));
    const [places,links]=await Promise.all([db.places.bulkGet(keys),db.catalogSources.bulkGet(keys)]);
    pending=[...places.flatMap(p=>p?[...(p.redirect?[p.redirect]:[]),...placeSourceIds(p)]:[]),...links.flatMap(link=>link?[link.canonicalId]:[])];
  }
  return allPlaces(undefined,[...seen]);
}
export async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<{ results: Origin[] }> {
  if (!personalMode) {
    try { return await api("/v1/geocode?q=" + encodeURIComponent(query), { signal }); }
    catch (e) { if (signal?.aborted) throw e; }
  }
  const params = new URLSearchParams({
    q: query,
    limit: "15",
  });
  const response = await fetch(
    "https://data.geopf.fr/geocodage/search?" + params,
    { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) },
  );
  if (!response.ok)
    throw new Error("Recherche indisponible. Réessayez plus tard.");
  const data = await response.json();
  return {
    results: (data.features || [])
      .map((f: any) => ({
        lat: f.geometry?.coordinates?.[1],
        lon: f.geometry?.coordinates?.[0],
        label: f.properties?.label,
        chosen: true,
      }))
      .filter(
        (p: Origin) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon) &&
          inFrance(p),
      )
      .slice(0, 8),
  };
}
const deferredNotifications = new WeakSet<object>();
export function notify() {
  let transaction = Dexie.currentTransaction;
  if (transaction) {
    while (transaction.parent) transaction = transaction.parent;
    const root = transaction;
    // Les lectures déclenchées par l’interface ne doivent pas rejoindre une écriture en cours.
    if (!deferredNotifications.has(root)) {
      deferredNotifications.add(root);
      root.on("complete", () => Dexie.ignoreTransaction(() => {
        deferredNotifications.delete(root);
        window.dispatchEvent(new Event("cailloute"));
      }));
    }
    return;
  }
  window.dispatchEvent(new Event("cailloute"));
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiBase() + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(25000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Service collaboratif indisponible pour le moment. La consultation reste accessible.");
  }
  if (!response.ok) {
    const error = new Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail) || "Erreur serveur",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return data;
}
export async function authenticate(
  username: string,
  password: string,
  register: boolean,
) {
  const guestFavorites = user ? [] : await db.favorites.toArray();
  const r = await api("/v1/auth/" + (register ? "register" : "login"), {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  await acceptSession(r, guestFavorites);
}
export async function acceptSession(r: {token: string; user: User}, guestFavorites: {id: string}[] = []) {
  bearer = r.token;
  user = r.user;
  localStorage.removeItem("blocked-users");
  localStorage.removeItem("blocked-user-names");
  try { const blocks = await api("/v1/me/blocks"); cacheBlocks(blockKey(apiBase(), user.id), blocks.users); } catch {}
  localStorage.setItem("user", JSON.stringify(user));
  if (native)
    await bridge.configure({ url: apiBase(), token: bearer, owner: user!.id });
  else localStorage.setItem("token", bearer);
  for (const f of guestFavorites)
    await enqueue("favorite.set", f.id, { value: true });
  notify();
  await sync();
}
export async function logout() {
  try {
    await api("/v1/auth/logout", { method: "POST" });
  } catch {}
  bearer = "";
  user = null;
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  localStorage.removeItem("blocked-users");
  localStorage.removeItem("blocked-user-names");
  if (native) await bridge.configure({ url: apiBase(), token: "", owner: "" });
  await db.favorites.clear();
  notify();
}
export async function changeServer(url: string) {
  url = url.trim().replace(/\/$/, "");
  const u = new URL(url);
  if (u.username || u.password || u.search || u.hash)
    throw new Error("Adresse serveur invalide.");
  if (
    u.protocol !== "https:" &&
    !(import.meta.env.DEV || import.meta.env.VITE_DEV_HTTP === "true")
  )
    throw new Error("Le serveur doit utiliser HTTPS.");
  if (!["http:", "https:"].includes(u.protocol))
    throw new Error("Utilisez une adresse HTTP(S).");
  if (await db.queue.count())
    throw new Error(
      "Envoyez ou supprimez les contributions en attente avant de changer de serveur.",
    );
  await logout();
  localStorage.setItem("server", url);
  await db.transaction("rw", db.places, db.details, db.meta, async () => {
    await db.places.clear();
    await db.details.clear();
    await db.meta.clear();
  });
  notify();
  await sync();
}
// Lire seulement la fiche et ses éventuels alias, jamais le catalogue national pour chaque photo.
async function personalSources(ids: string[]): Promise<Place[]> {
  const seen = new Set<string>();
  const excluded = new Set(await db.removed.toCollection().primaryKeys());
  const places: Place[] = [];
  let pending = [...new Set(ids)];
  while (pending.length) {
    const current = pending.filter(id => !seen.has(id) && !excluded.has(id));
    if (!current.length) break;
    current.forEach(id => seen.add(id));
    const rows = (await db.places.bulkGet(current)).filter((p): p is Place => !!p);
    // Les fichiers sont lus hors des écritures IndexedDB ; une attente réseau
    // ferait terminer prématurément la transaction d'une contribution.
    if(!Dexie.currentTransaction)await loadOpenEnrichmentForPlaces(rows);
    places.push(...rows.map(p=>p.catalog_version?enrichOpenImported(p):enrichImported(p)));
    pending = rows.flatMap(p => p.redirect ? [p.redirect] : []);
  }
  return places;
}
export async function enqueue(
  kind: string,
  place_id: string,
  payload: Record<string, unknown>,
  base_version?: number,
) {
  if(freeCollaborationEnabled && (!getFreeSession() || accountDeletionInProgress())) throw new Error("Connectez-vous pour contribuer.");
  if(freeCollaborationEnabled && (!getFreeSession()?.verified || !getFreeSession()?.termsAccepted || getFreeSession()?.blocked)) throw new Error("Le partage nécessite un compte vérifié, les conditions acceptées et des contributions autorisées. Consultez Profil.");
  const op: Op = {
    id: crypto.randomUUID(),
    kind,
    place_id,
    payload,
    ...(base_version === undefined ? {} : { base_version }),
  };
  if (personalMode) {
    if (kind === "place.delete") {
      await db.transaction("rw", ["personal", "places", "details", "favorites", "meta", "removed", "freeQueue"], async () => {
        await queueFreeOperation(op, await db.places.get(place_id));
        await eraseLocalPlaces([place_id]);
      });
      void runFreeSync();
      return op.id;
    }
    if (await db.removed.get(place_id)) throw new Error("Ce lieu a été supprimé définitivement.");
    await db.transaction("rw", ["personal", "places", "meta", "removed", "freeQueue"], async () => {
      const changes = await db.personal.toArray();
      const places = await personalSources([place_id, ...changes.map(c => c.id)]);
      const source = new Map(places.map((p) => [p.id, p]));
      const id = resolvePersonalId(place_id, source);
      const previous = canonicalPersonal(places, changes).find(
        (c) => c.id === id,
      );
      const base = source.get(id) || previous?.base;
      const changed = applyPersonal(base, previous, { ...op, place_id: id });
      await queueFreeOperation({ ...op, place_id: id }, source.get(id), base ? { ...base, ...previous?.patch } : undefined);
      const aliases = changes.filter(c => c.id !== id && resolvePersonalId(c.id, source) === id).map(c => c.id);
      if (aliases.length) await db.personal.bulkDelete(aliases);
      await db.personal.put(changed);
      const key = kind === "place.create" && !previous ? "added" : kind === "place.edit" && !previous?.informationEditedAt && !previous?.createdLocally ? "edited" : null;
      if (key) {
        const stats = { ...emptyStats, ...((await db.meta.get(freeCollaborationEnabled ? `contribution-stats:${getFreeSession()?.uid || "guest"}` : "contribution-stats"))?.value as ContributionStats || {}) };
        stats[key]++;
        await db.meta.put({ key: freeCollaborationEnabled ? `contribution-stats:${getFreeSession()?.uid || "guest"}` : "contribution-stats", value: stats });
        if(freeCollaborationEnabled)await db.meta.put({key:`account-backup-status:${getFreeSession()?.uid}`,value:{state:"pending"}});
      }
    });
    rememberContribution(place_id, kind);
    notify();
    if (!Dexie.currentTransaction) void runFreeSync();
    return op.id;
  }
  if (!user) throw new Error("Connectez-vous pour contribuer.");
  if (user.moderation?.can_contribute === false && !["favorite.set", "report.create"].includes(kind)) throw new Error("Contributions suspendues. Consultez la décision dans Profil.");
  await db.queue.put({
    id: op.id,
    operation: op,
    owner: user.id,
    server: apiBase(),
    created: Date.now(),
    status: "pending",
  });
  rememberContribution(place_id, kind);
  notify();
  void sync().then(async () => {
    const still = await db.queue.get(op.id);
    if (still?.status === "pending" && !syncState.message) void sync();
  });
  return op.id;
}
// Le lieu, l'avis et les photos sont conservés ensemble avant toute synchronisation.
export async function saveContribution(
  placeId: string,
  payload: Record<string, unknown>,
  baseVersion: number | undefined,
  review: { stars: number; text: string } | undefined,
  photos: { base64: string; caption: string }[],
  edits?: { id: string; version: number; payload: Record<string, unknown> }[],
) {
  const operations = [
    ...(edits ? edits.map((edit) => ({ kind: "place.edit", place_id: edit.id, payload: edit.payload, base_version: edit.version }))
      : [{ kind: baseVersion === undefined ? "place.create" : "place.edit", place_id: placeId, payload, base_version: baseVersion }]),
    ...(review ? [{ kind: "review.save", place_id: placeId, payload: review }] : []),
    ...photos.map(({ base64, caption }) => ({ kind: "photo.add", place_id: placeId, payload: { base64, caption, privacy_reviewed: true, rights_accepted: true } })),
  ];
  if (personalMode) {
    await db.transaction("rw", ["personal", "places", "meta", "removed", "freeQueue"], async () => {
      for (const operation of operations)
        await enqueue(operation.kind, operation.place_id, operation.payload, "base_version" in operation ? operation.base_version : undefined);
    });
  } else {
    if (!user) throw new Error("Connectez-vous pour contribuer.");
    const created = Date.now();
    await db.transaction("rw", db.queue, () => db.queue.bulkPut(operations.map((operation, index) => {
      const id = crypto.randomUUID();
      return { id, operation: { ...operation, id }, owner: user!.id,
        server: apiBase(), created: created + index, status: "pending" as const };
    })));
  }
  operations.forEach(op => rememberContribution(op.place_id, op.kind));
  notify();
  void sync();
}
export async function discard(id: string) {
  if (native) await bridge.forget({ id });
  await db.queue.delete(id);
  notify();
}
export async function retry(id: string) {
  const p = await db.queue.get(id);
  if (!p) return;
  if (native) await bridge.forget({ id });
  await db.queue.update(id, { status: "pending", error: undefined });
  await sync();
}
export async function favorite(p: Place) {
  if(freeCollaborationEnabled && (!getFreeSession() || accountDeletionInProgress())) throw new Error("Connectez-vous pour garder des favoris.");
  const ids = placeSourceIds(p);
  const existing = await db.favorites.where("id").anyOf(ids).toArray();
  if (existing.length) await db.favorites.bulkDelete(existing.map((f) => f.id));
  else await db.favorites.put({ id: p.id });
  if(freeCollaborationEnabled) {
    const uid=getFreeSession()!.uid;
    const row=await db.meta.get(`favorite-pending:${uid}`);
    const changes:Record<string,boolean>={...((row?.value || {}) as Record<string,boolean>)};
    if(existing.length) for(const item of existing) changes[item.id]=false; else changes[p.id]=true;
    await db.meta.put({key:`favorite-pending:${uid}`,value:changes});
    void syncAccountFavorites();
  }
  if (user && !personalMode) {
    if (existing.length) for (const item of existing) await enqueue("favorite.set", item.id, { value: false });
    else await enqueue("favorite.set", p.id, { value: true });
  }
}

let busy: Promise<void> | null = null;
export let syncState = {
  busy: false,
  message: "",
  last: localStorage.getItem("lastSync") || "",
};
export function sync() {
  if (offlineMap()) { stopAdminLive(); return Promise.resolve(); }
  // Le catalogue initial reste inchangé en mode personnel.
  if (personalMode) return freeCollaborationEnabled ? runFreeSync() : Promise.resolve();
  if (busy) return busy;
  busy = performSync().finally(() => {
    busy = null;
    syncState.busy = false;
    notify();
  });
  return busy;
}
async function performSync() {
  syncState.busy = true;
  syncState.message = "";
  notify();
  try {
    if (user && !personalMode) {
      const queue = (await db.queue.orderBy("created").toArray()).filter(
        (q) => q.owner === user!.id && q.server === apiBase(),
      );
      if (native) {
        await bridge.configure({
          url: apiBase(),
          token: bearer,
          owner: user.id,
        });
        for (const q of queue.filter((q) => q.status === "pending"))
          await bridge.enqueue({
            operation: JSON.stringify(q.operation),
            owner: q.owner,
            server: q.server,
          });
        await bridge.flush();
        const { items } = await bridge.statuses();
        for (const r of items) {
          if (r.status === "done") {
            await db.queue.delete(r.id);
            await bridge.forget({ id: r.id });
          } else if (r.status === "error")
            await db.queue.update(r.id, { status: "error", error: r.error });
        }
      } else {
        for (const q of queue.filter((q) => q.status === "pending")) {
          try {
            await api("/v1/operations", {
              method: "POST",
              body: JSON.stringify(q.operation),
            });
            await db.queue.delete(q.id);
          } catch (e) {
            const err = e as Error & { status?: number };
            if (
              err.status &&
              err.status >= 400 &&
              err.status < 500 &&
              err.status !== 429
            ) {
              await db.queue.update(q.id, {
                status: "error",
                error: err.message,
              });
            } else throw e;
          }
        }
      }
    }
    let more = true;
    let cursor = Number((await db.meta.get("cursor"))?.value || 0);
    if (cursor === 0) {
      let after = "";
      let snapshotMore = true;
      let checkpoint: number | null = null;
      const snapshot: Place[] = [];
      while (snapshotMore) {
        const r = await api(
          "/v1/bootstrap?after=" + encodeURIComponent(after) + "&limit=1500",
        );
        if (checkpoint === null) checkpoint = r.revision;
        snapshot.push(...r.places);
        after = r.after;
        snapshotMore = r.has_more;
      }
      await db.transaction("rw", db.places, db.meta, db.favorites, async () => {
        for (const p of snapshot.filter((p) => p.redirect)) {
          if (await db.favorites.get(p.id)) {
            await db.favorites.put({ id: p.redirect! });
            await db.favorites.delete(p.id);
          }
        }
        await db.places.clear();
        await db.places.bulkPut(snapshot);
        await db.meta.put({ key: "cursor", value: checkpoint || 0 });
      });
      cursor = checkpoint || 0;
    }

    while (more) {
      const r = await api("/v1/sync?cursor=" + cursor + "&limit=1000");
      await db.transaction("rw", db.places, db.meta, db.favorites, db.removed, async () => {
        const data = r.changes.map((c: { place: Place }) => c.place) as Place[];
        for (const p of data.filter((p) => p.redirect)) {
          if (await db.favorites.get(p.id)) {
            await db.favorites.put({ id: p.redirect! });
            await db.favorites.delete(p.id);
          }
        }
        await db.places.bulkPut(data.filter((p) => !p.deleted));
        const deleted = data.filter((p) => p.deleted).map(p => p.id);
        await db.places.bulkDelete(deleted);
        await db.removed.bulkPut(deleted.map(id => ({ id })));
        await db.meta.put({ key: "cursor", value: r.cursor });
      });
      cursor = r.cursor;
      more = r.has_more;
    }
    if (user && !personalMode) {
      const me = await api("/v1/me");
      user = { ...user!, role: me.role, moderation: me.moderation, terms_version: me.terms_version };
      localStorage.setItem("user", JSON.stringify(user));
      try { const blocks = await api("/v1/me/blocks"); cacheBlocks(blockKey(apiBase(), user.id), blocks.users); } catch {}
      const pending = await db.queue.toArray();
      const pendingIds = new Set(
        pending
          .filter(
            (q) => q.owner === user?.id && q.operation.kind === "favorite.set",
          )
          .map((q) => q.operation.place_id),
      );
      await db.transaction("rw", db.favorites, async () => {
        const local = await db.favorites.toArray();
        await db.favorites.clear();
        await db.favorites.bulkPut([
          ...me.favorites
            .filter((id: string) => !pendingIds.has(id))
            .map((id: string) => ({ id })),
          ...local.filter((x) => pendingIds.has(x.id)),
        ]);
      });
    }
    syncState.last = new Date().toISOString();
    localStorage.setItem("lastSync", syncState.last);
  } catch (e) {
    syncState.message = (e as Error).message.includes("Failed to fetch")
      ? "Hors connexion · données conservées"
      : (e as Error).message;
  }
}
// Une seule lecture des contributions pour toute la fiche, même si elle regroupe plusieurs sources.
async function personalDetails(ids: string[]): Promise<Detail[]> {
  const changes = await db.personal.toArray();
  const places = await personalSources([...ids, ...changes.map(c => c.id)]);
  const source = new Map(places.map(p => [p.id,p]));
  const edits = new Map(canonicalPersonal(places,changes).map(c => [c.id,c]));
  const resolved = ids.map(id => resolvePersonalId(id,source));
  const cached = await db.details.bulkGet(resolved);
  // Réparer les anciennes copies consultées localement, sans appel Firebase.
  for (let i=0;i<cached.length;i++) {
    const previous=cached[i]; if(!previous) continue;
    const unique=uniqueReviewDetail(previous);
    if(unique!==previous) {
      const repaired=await db.transaction("rw",["details","places"],async()=>{
        const current=await db.details.get(previous.id);
        if(!current) return;
        const cleaned=uniqueReviewDetail(current);
        await db.details.put(cleaned);
        const place=await db.places.get(previous.id);
        if(place) await db.places.put({...place,rating:cleaned.rating,review_count:cleaned.review_count});
        return cleaned;
      });
      cached[i]=repaired;
    }
  }
  return resolved.map((id,i) => {
    const change=edits.get(id), place=source.get(id)||change?.base;
    if(!place) throw new Error("Lieu introuvable sur cet appareil.");
    return normalizePlace(personalDetail({...place,rating:cached[i]?.rating??place.rating,review_count:cached[i]?.review_count??place.review_count,reviews:cached[i]?.reviews||[],photos:cached[i]?.photos||[]},change,getFreeSession()?.uid));
  });
}
export async function getDetail(id: string, sort = "relevant", refreshPhotos=true) {
  if (personalMode) {const detail=(await personalDetails([id]))[0];if(freeCollaborationEnabled && refreshPhotos)void cacheFreePreviews(detail.id);return detail;}
  if (freeCollaborationEnabled && refreshPhotos) void cacheFreePreviews(id);
  try {
    const d = await api<Detail>(
      `/v1/places/${encodeURIComponent(id)}?sort=${sort}`,
    );
    const unique=uniqueReviewDetail(d);
    await loadOpenEnrichmentForPlaces([unique]);
    for (const photo of unique.photos) {
      try { photo.url = await convertPhotoUrl(photoUrl(photo.url)); } catch { /* Conserver la référence disponible. */ }
    }
    await db.details.put(unique);
    return normalizePlace(enrichImported(unique));
  } catch (e) {
    const cached = await db.details.get(id);
    if (cached) {await loadOpenEnrichmentForPlaces([cached]);return normalizePlace(enrichImported(uniqueReviewDetail(cached)));}
    const p = await db.places.get(id);
    if (p) {await loadOpenEnrichmentForPlaces([p]);return normalizePlace(enrichImported({ ...p, reviews: [], photos: [] } as Detail));}
    throw e;
  }
}
// Compatibilité du nom public ; une consultation lit désormais une seule fiche persistée.
export async function getGroupedDetail(place:Place,sort="relevant"):Promise<Detail> {
  return getDetail(place.id,sort,false);
}

export async function eraseLocalPlaces(ids: string[]) {
  const roots=await db.places.bulkGet(ids);
  ids=[...new Set(roots.flatMap((p,i)=>p?.catalog_sources||[ids[i]]))];
  await db.transaction("rw", ["personal", "places", "details", "favorites", "removed"], async () => {
    await db.removed.bulkPut(ids.map(id => ({ id })));
    await (db.personal as any).bulkDelete(ids);
    await db.places.bulkDelete(ids);
    await db.details.bulkDelete(ids);
    await db.favorites.bulkDelete(ids);
  });
  for (const id of ids) localStorage.removeItem(`nearby-prompt-v1:${id}`);
  notify();
}
let freeSessionSubscribed = false;
let nativeSyncSubscribed = false;
export async function boot() {
  await prepareCanonicalCatalog();
  if (!(await db.meta.get(freeCollaborationEnabled ? `contribution-stats:${getFreeSession()?.uid || "guest"}` : "contribution-stats"))) {
    const changes = await db.personal.toArray();
    await db.meta.put({ key: freeCollaborationEnabled ? `contribution-stats:${getFreeSession()?.uid || "guest"}` : "contribution-stats", value: {
      added: changes.filter(c => c.createdLocally || c.base.community).length,
      edited: changes.filter(c => !c.createdLocally && !c.base.community && c.informationEditedAt).length,
    } });
  }
  const oldDeleted = (await db.personal.toArray()).filter(c => c.patch.deleted).map(c => c.id);
  if (oldDeleted.length) await eraseLocalPlaces(oldDeleted);
  if (native && !personalMode) {
    const session = await bridge.session();
    bearer = session.token;
    if (user?.id !== session.owner) {
      bearer = "";
      user = null;
    }
  }
  if (native && !nativeSyncSubscribed) {
    nativeSyncSubscribed = true;
    await NativeApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) refreshForeground();
    });
    await Network.addListener("networkStatusChange", ({ connected }) => {
      if (connected) refreshForeground();
    });
  }
  // L’app personnelle importe désormais ces lieux par zones et dans le rayon choisi.
  if(!personalMode || !freeCollaborationEnabled) {
  if (!(await db.meta.get("catalog-012"))) {
    try {
      const r = await fetch("/seed.json");
      if (!r.ok) throw new Error("Catalogue indisponible");
      const seed: Place[] = await r.json();
      await db.transaction("rw", db.places, db.meta, async () => {
        const existing = new Map(
          (await db.places.toArray()).map((p) => [p.id, p]),
        );
        await db.places.bulkPut(
          seed.map((p) => {
            const old = existing.get(p.id);
            return old
              ? {
                  ...old,
                  transit_modes: old.transit_modes ?? p.transit_modes,
                  transit_lines: old.transit_lines ?? p.transit_lines,
                  toilets_available:
                    old.toilets_available === undefined
                      ? p.toilets_available
                      : old.toilets_available,
                }
              : p;
          }),
        );
        await db.meta.put({ key: "catalog-012", value: true });
      });
    } catch {}
  }
  // Complément demandé pour cette version : ajout unique, sans écraser les lieux ni contributions.
  if (!(await db.meta.get("catalog-017"))) {
    try {
      const response = await fetch("/catalog-017.json");
      if (!response.ok) throw new Error("Complément indisponible");
      const additions: Place[] = await response.json();
      await db.transaction("rw", db.places, db.meta, async () => {
        const ids = new Set(await db.places.toCollection().primaryKeys());
        await db.places.bulkAdd(additions.filter(p => !ids.has(p.id)));
        await db.meta.put({ key: "catalog-017", value: true });
      });
    } catch { /* Nouvelle tentative à la prochaine ouverture, sans altérer le catalogue existant. */ }
  }
  // Complément RPPS demandé : ajout unique, sans réécrire les lieux ou contributions.
  if (!(await db.meta.get("catalog-health-015"))) {
    try {
      const response = await fetch("/catalog-health-015.json");
      if (!response.ok) throw new Error("Complément santé indisponible");
      const additions: Place[] = await response.json();
      await db.transaction("rw", db.places, db.meta, async () => {
        const ids = new Set(await db.places.toCollection().primaryKeys());
        await db.places.bulkAdd(additions.filter(p => !ids.has(p.id)));
        await db.meta.put({key: "catalog-health-015", value: true});
      });
    } catch { /* Nouvelle tentative à l’ouverture suivante. */ }
  }
  for (const catalog of ["catalog-toilets-017", "catalog-family-017"]) {
    const importKey = `${catalog}-complete-v1`;
    if (await db.meta.get(importKey)) continue;
    try {
      const response = await fetch(`/${catalog}.json`);
      if (!response.ok) throw new Error("Complément indisponible");
      const additions: Place[] = await response.json();
      await db.transaction("rw", db.places, db.meta, async () => {
        const ids = new Set(await db.places.toCollection().primaryKeys());
        await db.places.bulkAdd(additions.filter((p) => !ids.has(p.id)));
        await db.meta.put({key: importKey, value: true});
      });
    } catch { /* Réessayer sans modifier les contributions existantes. */ }
  }
  }
  // Les fusions sont appliquées par proximité à la consultation, jamais à tout le cache au démarrage.
  const removed = await db.removed.toCollection().primaryKeys();
  if (removed.length) await eraseLocalPlaces(removed);
  // Conversion en arrière-plan : les lieux restent consultables immédiatement.
  void compressStoredPhotos().then(() => sync()).catch(() => sync());
  if (freeCollaborationEnabled && !freeSessionSubscribed) { freeSessionSubscribed = true; subscribeFreeSession(() => {void sync();void syncAccountFavorites();void syncAccountBackup(true);notify();}); }
}
// Android et la WebView annoncent parfois le même retour deux fois.
let lastForegroundRefresh=0;
function refreshForeground(){
  const now=Date.now();
  if(now-lastForegroundRefresh<1000)return;
  lastForegroundRefresh=now;
  void sync();void syncAccountFavorites();
}
window.addEventListener("online", refreshForeground);
window.addEventListener("offline", stopAdminLive);
window.addEventListener("map-mode", () => { if (offlineMap()) stopAdminLive(); if (!offlineMap()) {void sync();void syncAccountFavorites();} });
document.addEventListener("visibilitychange", () => {if(document.visibilityState==="visible")refreshForeground();});


// Enregistrer tout le lot en une transaction évite un ajout partiel en cas d'échec.
async function enqueueBatch(operations: { kind: string; place_id: string; payload: Record<string, unknown>; base_version?: number }[]) {
  if (personalMode) {
    await db.transaction("rw", ["personal", "places", "meta", "removed", "freeQueue"], async () => {
      for (const op of operations) await enqueue(op.kind, op.place_id, op.payload, op.base_version);
    });
  } else {
    if (!user) throw new Error("Connectez-vous pour contribuer.");
    const created = Date.now();
    await db.queue.bulkPut(operations.map((operation, index) => {
      const id = crypto.randomUUID();
      return { id, operation: { ...operation, id }, owner: user!.id, server: apiBase(), created: created + index, status: "pending" as const };
    }));
    await sync();
  }
  notify();
  if (personalMode) void sync();
}
export async function addPhotos(place_id: string, photos: { base64: string; caption: string }[]) {
  await enqueueBatch(photos.map(({ base64, caption }) => ({ kind: "photo.add", place_id, payload: { base64, caption, privacy_reviewed: true, rights_accepted: true } })));
  if (photos.length) rememberContribution(place_id, "photo.add");
}
export async function validateInformation(places: Place[], value: boolean) {
  await enqueueBatch(places.map((p) => ({ kind: "place.validate", place_id: p.id, payload: { value }, base_version: p.version })));
  places.forEach(p => rememberContribution(p.id, "place.validate"));
}


// Conversion progressive avec comparaison : ne jamais rétablir une photo supprimée entre-temps.
export async function compressStoredPhotos() {
  const policy="webp-40000-960-v1";
  const previous=(await db.meta.get("photo-webp-migration"))?.value as {policy?:string;failures?:string[]}|undefined;
  if(previous?.policy===policy && previous.failures?.length===0)return;
  const failures: string[] = [];
  for (const table of [db.personal, db.details]) {
    for (const row of await table.toArray()) {
      for (const photo of row.photos) {
        try {
          const url = await convertPhotoUrl(photoUrl(photo.url));
          if (url === photo.url) continue;
          await db.transaction("rw", table, async () => {
            const current = await table.get(row.id);
            const saved = current?.photos.find(p => p.id === photo.id && p.url === photo.url);
            if (!current || !saved) return;
            saved.url = url;
            await (table as Table<PersonalPlace | Detail, string>).put(current);
          });
        } catch { failures.push(photo.id); }
      }
    }
  }
  for (const table of [db.queue, db.freeQueue]) {
    for (const row of await table.toArray()) {
      if (row.operation.kind !== "photo.add") continue;
      const original = String(row.operation.payload.base64 || "");
      try {
        const url = await convertPhotoUrl(photoDataUrl(original));
        const value = original.startsWith("data:") ? url : url.split(",")[1];
        await db.transaction("rw", table, async () => {
          const current = await table.get(row.id);
          if (!current || current.operation.payload.base64 !== original) return;
          current.operation.payload.base64 = value;
          await (table as Table<Pending | FreeQueueItem, string>).put(current);
        });
      } catch { failures.push(row.id); }
    }
  }
  for (const row of await db.meta.where("key").startsWith("profile-avatar:").toArray()) {
    if (typeof row.value !== "string" || !row.value.startsWith("data:image/")) continue;
    try {
      const value = await convertPhotoUrl(row.value);
      if (value === row.value) continue;
      await db.transaction("rw", db.meta, async () => {
        if ((await db.meta.get(row.key))?.value === row.value) await db.meta.put({...row,value});
      });
      if (native && (await db.meta.get(row.key))?.value === value) {
        const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
        await Filesystem.writeFile({path:`avatars/${encodeURIComponent(row.key)}.txt`,data:value,directory:Directory.Data,encoding:Encoding.UTF8,recursive:true});
      }
    } catch { failures.push(row.key); }
  }
  // Les échecs sont conservés et réessayés à la prochaine ouverture.
  await db.meta.put({key:"photo-webp-migration",value:{policy,date:new Date().toISOString(),failures}});
}
