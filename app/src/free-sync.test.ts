import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Op, Place } from "./types";
const f = vi.hoisted(() => {
  function table() {
    const rows = new Map<string, any>();
    return { rows, get: async (id: string) => rows.get(id), put: async (row: any) => { rows.set(row.id ?? row.key, structuredClone(row)); }, delete: async (id: string) => { rows.delete(id); }, bulkDelete:async(ids:string[])=>{for(const id of ids)rows.delete(id);},toArray: async () => [...rows.values()], orderBy: () => ({ toArray: async () => [...rows.values()].filter(row=>typeof row.created === "number" && Number.isFinite(row.created)).sort((a, b) => a.created - b.created) }) };
  }
  const db = { catalogSources:table(),sourceRevisions:table(),meta: table(), places: table(), personal: table(), details: table(), removed: table(), favorites: table(), freeQueue: table(), transaction: async (...args: any[]) => args.at(-1)() };
  return { db, account: { uid: "alice", verified: true, termsAccepted: true, blocked: false } as any, watch: vi.fn(), watchPlace:vi.fn(), push: vi.fn(), fetch: vi.fn(), previews: vi.fn(), notify: vi.fn() };
});
vi.mock("./store", () => ({ db: f.db, notify: f.notify }));
vi.mock("./free-cloud", () => ({ freeCollaborationEnabled: true, accountDeletionInProgress:()=>false, getFreeSession: () => f.account, freeReadsLeft:async()=>{const {automaticReadsLeft}=await import('./cloud-budget');return automaticReadsLeft(f.account?.isAdmin?'admin':'automatic');}, watchFreePlace:f.watchPlace, watchFreeChanges: f.watch, pushFreeOperation: f.push, fetchFreeChanges: f.fetch, fetchFreePreviewPage: async()=>({photos:await f.previews(),cursor:{source:1},hasMore:false}), syncFreePrivateDecisions: vi.fn(async()=>0) }));
vi.mock("./free-policy", () => ({ sharedCells: () => ["180:20"] }));
import { stopAdminLive, queueFreeOperation, runFreeSync, retryFreeContributions, applyFreeChanges, cacheFreePreviews, watchAdminDetail,refreshFreePreviews } from "./free-sync";
import { FREE_DAY, freeFailure, shareableFreeOperation } from "./free-sync-policy";
const place = { id: "source-1", name: "Parc public", version: 8, lat: 45, lon: 5, sources: [{ key: "osm" }] } as Place;
const edit = (id = "op1"): Op => ({ id, place_id: place.id, kind: "place.edit", payload: { name: "Parc corrigé" } });
beforeEach(() => {
  stopAdminLive();
  f.watch.mockReset();f.watch.mockReturnValue(vi.fn());f.watchPlace.mockReset();f.watchPlace.mockReturnValue(vi.fn());
  for (const value of Object.values(f.db)) if (typeof value !== "function") value.rows.clear();
  f.account = { uid: "alice", verified: true, termsAccepted: true, blocked: false };
  vi.stubGlobal("document", { visibilityState: "visible" }); vi.stubGlobal("navigator", { onLine: true }); vi.stubGlobal("localStorage", { getItem: () => null });
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
  f.push.mockReset(); f.fetch.mockReset(); f.previews.mockReset();
  f.fetch.mockResolvedValue({ changes: [], cursor: null, hasMore: false });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("échanges gratuits privés et bornés", () => {
  it("ne publie jamais l’historique privé à la connexion", async () => {
    await f.db.personal.put({ id: "private", patch: { name: "Secret" } });
    await runFreeSync(); expect(f.push).not.toHaveBeenCalled(); expect(await f.db.freeQueue.toArray()).toEqual([]);
  });
  it("ne partage que les nouveaux champs, avec révision 0 pour un import", async () => {
    const current = { ...place, name: "Nom privé" };
    await queueFreeOperation({ ...edit(), payload: { name: "Nom privé", hours: "10:00-18:00" } }, place, current);
    const item = (await f.db.freeQueue.toArray())[0];
    expect(item.operation.payload).toEqual({ hours: "10:00-18:00" }); expect(item.operation.base_version).toBe(0); expect(item.base.name).toBe("Parc public");
  });
  it("conserve les contributions privées des comptes non vérifiés et bloqués", async () => {
    f.account.verified = false; await queueFreeOperation(edit(), place, place);
    f.account.verified = true; f.account.blocked = true; await queueFreeOperation(edit(), place, place);
    expect(await f.db.freeQueue.toArray()).toEqual([]);
  });
  it("n’envoie pas les opérations d’un autre compte", async () => {
    await queueFreeOperation(edit(), place, place); f.account = { ...f.account, uid: "bob" }; await runFreeSync();
    expect(f.push).not.toHaveBeenCalled(); expect((await f.db.freeQueue.toArray()).length).toBe(1);
  });
  it("pause 24 heures sur quota sans perdre l’opération", async () => {
    await queueFreeOperation(edit(), place, place); f.push.mockRejectedValue(Object.assign(new Error("Quota"), { code: "resource-exhausted" }));
    await runFreeSync(); await runFreeSync(); expect(f.push).toHaveBeenCalledTimes(1);
    expect((await f.db.meta.get("free-sync-v1")).value.pausedUntil).toBeGreaterThanOrEqual(Date.now() + FREE_DAY);
    expect((await f.db.freeQueue.toArray()).length).toBe(1);
  });
  it("envoie automatiquement les lots suivants sans nouvelle action", async () => {
    for(let i=0;i<6;i++)await queueFreeOperation(edit(`batch-${i}`),place,place);
    f.push.mockImplementation(async(op:Op)=>({id:place.id,place:{...place,name:op.payload.name,version:1},reviews:[],deleted:false,updated:Date.now()}));
    await runFreeSync();expect(f.push).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1000);expect(f.push).toHaveBeenCalledTimes(6);expect(await f.db.freeQueue.toArray()).toEqual([]);
  });
  it("ne relit pas une zone inchangée dans les 24 heures", async () => {
    await runFreeSync(); await runFreeSync(); expect(f.fetch).toHaveBeenCalledTimes(1);
    expect((await f.db.meta.get("free-sync-v1")).value.reads).toBe(1);
  });
  it("applique une suppression reçue partout, sans détails ni photos résiduels", async () => {
    for (const table of [f.db.places, f.db.personal, f.db.details, f.db.favorites]) await table.put({ id: place.id });
    await applyFreeChanges([{ id: place.id, deleted: true, place: null, reviews: [], updated: Date.now() }]);
    expect(await f.db.places.get(place.id)).toBeUndefined(); expect(await f.db.personal.get(place.id)).toBeUndefined(); expect(await f.db.details.get(place.id)).toBeUndefined(); expect(await f.db.favorites.get(place.id)).toBeUndefined(); expect(await f.db.removed.get(place.id)).toEqual({ id: place.id });
  });
  it("réutilise les aperçus sans requête tant que la version ne change pas", async () => {
    await f.db.meta.put({ key: `free-version:${place.id}`, value: 2 }); await f.db.details.put({ ...place, photos: [], reviews: [] });
    f.previews.mockResolvedValue([]); await cacheFreePreviews(place.id); vi.advanceTimersByTime(FREE_DAY * 3); await cacheFreePreviews(place.id);
    expect(f.previews).toHaveBeenCalledTimes(1);
  });

  it("rebase seulement les opérations locales suivantes après accusé de réception", async () => {
    await queueFreeOperation(edit("first"), place, place);
    await queueFreeOperation({ ...edit("second"), payload: { hours: "10:00-18:00" } }, place, place);
    f.push.mockImplementation(async (op: Op) => ({ id: place.id, place: { ...place, version: op.base_version! + 1 }, reviews: [], deleted: false, updated: Date.now() }));
    await runFreeSync();
    expect(f.push.mock.calls.map(call => call[0].base_version)).toEqual([0, 1]); expect(await f.db.freeQueue.toArray()).toEqual([]);
  });
  it("garde la file du compte initial si la session change pendant l’envoi", async () => {
    await queueFreeOperation(edit(), place, place);
    f.push.mockImplementation(async () => { f.account = { ...f.account, uid: "bob" }; return { id: place.id, place, reviews: [], deleted: false, updated: Date.now() }; });
    await runFreeSync(); expect((await f.db.freeQueue.toArray()).length).toBe(1); expect(await f.db.places.get(place.id)).toBeUndefined();
  });
  it("partage un nouvel aperçu après sa nouvelle fiche, jamais une ancienne fiche privée", async () => {
    const photo: Op = { ...edit("photo"), kind: "photo.add", payload: { base64: "aGVsbG8=", caption: "Parc" } };
    await queueFreeOperation(photo); expect(await f.db.freeQueue.toArray()).toEqual([]);
    await queueFreeOperation({ ...edit("create"), kind: "place.create", payload: { ...place } });
    await queueFreeOperation(photo); expect((await f.db.freeQueue.toArray()).length).toBe(2);
  });
  it("respecte les 50 lectures quotidiennes même avec plusieurs pages", async () => {
    f.fetch.mockImplementation(async (_cells: string[], _cursor: unknown, limit: number) => ({ changes: Array.from({ length: limit }, (_, i) => ({ id: "p" + i, place: { ...place, id: "p" + i }, reviews: [], deleted: false, updated: Date.now() })), cursor: { time: Date.now(), id: "last", seconds: 1, nanoseconds: 123 }, hasMore: true }));
    for (let i = 0; i < 6; i++) await runFreeSync();
    expect(f.fetch.mock.calls.map(call => call[2])).toEqual([20, 20, 10]);
    expect((await f.db.meta.get("free-sync-v1")).value.zones["180:20"].cursor.nanoseconds).toBe(123);
  });
  it("conserve l’attribution du catalogue lors d’une mise à jour partagée", async () => {
    await f.db.places.put(place); await applyFreeChanges([{ id: place.id, place: { ...place, name: "Corrigé", sources: [] }, reviews: [], deleted: false, updated: Date.now() }]);
    expect((await f.db.places.get(place.id)).sources).toEqual(place.sources);
  });
  it("classe les conflits sans réessai automatique et borne le backoff réseau", () => {
    expect(freeFailure({ code: "free/conflict" }, 0, 0, 0).permanent).toBe(true);
    expect(freeFailure({ code: "unavailable" }, 0, 100, 0).retry).toBeLessThanOrEqual(FREE_DAY);
    expect(shareableFreeOperation({ ...edit(), kind: "photo.add", payload: { base64: "a".repeat(53360) } }, place, place)).toBeNull();
  });
});

it("un stockage plein pour une nouvelle fiche laisse les autres fiches se synchroniser", async () => {
  await queueFreeOperation(edit("full-op"), place, place);
  const other = { ...place, id: "source-2" };
  await queueFreeOperation({ ...edit("available-op"), place_id: other.id }, other, other);
  f.push.mockRejectedValueOnce(Object.assign(new Error("Stockage plein"), { code: "free/storage-full" }));
  f.push.mockResolvedValueOnce({ id: other.id, place: { ...other, version: 1 }, reviews: [], deleted: false, updated: Date.now() });
  await runFreeSync();
  expect(f.push).toHaveBeenCalledTimes(2);
  expect((await f.db.freeQueue.get("full-op")).status).toBe("error");
  expect(await f.db.freeQueue.get("available-op")).toBeUndefined();
  expect(freeFailure({ code: "resource-exhausted" }, Date.now(), 0, 0).pause).toBe(Date.now() + FREE_DAY);
});

describe("suppression des contenus privés et ordre durable", () => {
  it("ne supprime aucun avis partagé lorsque l’avis supprimé est privé", async () => {
    await queueFreeOperation({ ...edit("draft"), kind: "review.save", payload: { text: "Brouillon", stars: 4 } }, place, place);
    await queueFreeOperation({ ...edit("delete"), kind: "review.delete", payload: { review_id: "old-private-id" } }, place, place);
    expect(await f.db.freeQueue.toArray()).toEqual([]);
  });
  it("supprime seulement l’avis partagé du compte connecté", async () => {
    await queueFreeOperation({ ...edit(), kind: "review.delete", payload: { review_id: "alice" } }, place, place);
    expect((await f.db.freeQueue.toArray())[0].operation.payload).toEqual({ id: "alice" });
  });
  it("annule l’aperçu en attente lorsqu’on le retire localement", async () => {
    await queueFreeOperation({ ...edit("draft-photo"), kind: "photo.add", payload: { base64: "aGVsbG8=" } }, place, place);
    await queueFreeOperation({ ...edit("delete"), kind: "photo.delete", payload: { photo_id: "draft-photo" } }, place, place);
    expect(await f.db.freeQueue.toArray()).toEqual([]);
  });
  it("ordonne strictement les actions du même instant, indépendamment de leur identifiant", async () => {
    await queueFreeOperation(edit("z-first"), place, place);
    await queueFreeOperation({ ...edit("a-second"), payload: { hours: "10:00" } }, place, place);
    const rows = await f.db.freeQueue.orderBy().toArray();
    expect(rows.map(row => row.id)).toEqual(["z-first", "a-second"]);
    expect(rows[1].created).toBeGreaterThan(rows[0].created);
  });
  it("ne réintroduit pas des aperçus arrivés après une révision plus récente", async () => {
    await f.db.meta.put({ key: `free-version:${place.id}`, value: 2 }); await f.db.details.put({ ...place, photos: [], reviews: [] });
    f.previews.mockImplementation(async () => { await f.db.meta.put({ key: `free-version:${place.id}`, value: 3 }); return [{id: "stale-photo"}]; });
    await cacheFreePreviews(place.id);
    expect((await f.db.details.get(place.id)).photos).toEqual([]);
    expect(await f.db.meta.get(`free-previews:${place.id}`)).toBeUndefined();
  });
});

it("le quota d’une opération n’arrête ni les autres lieux ni la réception, sans rejouer avant minuit", async () => {
  await queueFreeOperation({ ...edit("delete"), kind: "place.delete" }, place, place);
  const other = { ...place, id: "other-place" };
  await queueFreeOperation({ ...edit("other-edit"), place_id: other.id }, other, other);
  f.push.mockImplementation(async (op: Op) => {
    if (op.kind === "place.delete") throw Object.assign(new Error("Quota quotidien"), { code: "free/daily-quota" });
    return { id: other.id, place: { ...other, version: 1 }, reviews: [], deleted: false, updated: Date.now() };
  });
  await runFreeSync();
  expect(f.push).toHaveBeenCalledTimes(2); expect(f.fetch).toHaveBeenCalledTimes(1);
  const remaining = await f.db.freeQueue.toArray();
  expect(remaining).toHaveLength(1); expect(remaining[0].retryAt).toBe(Date.parse("2026-09-19T00:00:00Z"));
  expect((await f.db.meta.get("free-sync-v1")).value.pausedUntil).toBe(0);
  await runFreeSync(); expect(f.push).toHaveBeenCalledTimes(2);
  vi.setSystemTime(remaining[0].retryAt); await runFreeSync(); expect(f.push).toHaveBeenCalledTimes(3);
});

it("ne lance pas un deuxième échange si un autre onglet détient déjà le verrou", async () => {
  const request = vi.fn(async (_name, _options, callback) => callback(null));
  vi.stubGlobal("navigator", { onLine: true, locks: { request } });
  await runFreeSync();
  expect(request).toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled(); expect(f.push).not.toHaveBeenCalled();
});

it("met en file la suppression d’une photo partagée avec un identifiant sans slot",async()=>{
  const photoId=`${place.id}_operation-photo-123`;
  await queueFreeOperation({...edit("delete-new-photo"),kind:"photo.delete",payload:{photo_id:photoId}},place,place);
  expect((await f.db.freeQueue.toArray())[0].operation.payload).toEqual({id:photoId});
});

it("reprend à l’échéance persistée sans nouvelle action de l’utilisateur", async () => {
  await queueFreeOperation(edit(), place, place);
  await f.db.meta.put({key:'free-sync-v1',value:{day:Date.now(),reads:0,last:0,pausedUntil:0,nextAttempt:Date.now()+60000,failures:3,zones:{}}});
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  await runFreeSync(); expect(f.push).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.push).toHaveBeenCalledTimes(1); expect(await f.db.freeQueue.toArray()).toEqual([]);
});
it("réessaie après plus de deux erreurs réseau en respectant le délai", async () => {
  await queueFreeOperation(edit(), place, place);
  await f.db.meta.put({key:'free-sync-v1',value:{day:Date.now(),reads:0,last:0,pausedUntil:0,nextAttempt:0,failures:3,zones:{}}});
  f.push.mockRejectedValueOnce(Object.assign(new Error('Réseau'),{code:'unavailable'})).mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  await runFreeSync();
  const next=(await f.db.meta.get('free-sync-v1')).value.nextAttempt;
  await vi.advanceTimersByTimeAsync(Math.ceil(next-Date.now()));
  expect(f.push).toHaveBeenCalledTimes(2); expect(await f.db.freeQueue.toArray()).toEqual([]);
});
it("un verrou temporairement occupé ne laisse pas les contributions oubliées", async () => {
  await queueFreeOperation(edit(), place, place);
  const request=vi.fn().mockImplementationOnce(async(_name,_options,cb)=>cb(null)).mockImplementation(async(_name,_options,cb)=>cb({name:'cailloute-free-sync'}));
  vi.stubGlobal('navigator',{onLine:true,locks:{request}});
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  await runFreeSync();expect(f.push).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.push).toHaveBeenCalledTimes(1);expect(await f.db.freeQueue.toArray()).toEqual([]);
});
it("l’attente quotidienne des réceptions ne retarde pas les envois", async () => {
  await runFreeSync();
  await queueFreeOperation(edit(), place, place);
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  await runFreeSync();expect(f.push).toHaveBeenCalledTimes(1);expect(f.fetch).toHaveBeenCalledTimes(1);
});

it("explique un envoi manuel ignoré car l’application est cachée", async()=>{
  await queueFreeOperation(edit(),place,place);
  vi.stubGlobal('document',{visibilityState:'hidden'});
  const result=await retryFreeContributions();
  expect(result).toContain('arrière-plan');expect(f.push).not.toHaveBeenCalled();
  expect(await f.db.freeQueue.toArray()).toHaveLength(1);
});
it("explique un délai persistant lors d’un envoi manuel sans contourner le quota",async()=>{
  await queueFreeOperation(edit(),place,place);
  await f.db.meta.put({key:'free-sync-v1',value:{day:Date.now(),reads:0,last:0,pausedUntil:Date.now()+60000,nextAttempt:0,failures:1,zones:{}}});
  expect(await retryFreeContributions()).toContain('différé');expect(f.push).not.toHaveBeenCalled();
});
it("affiche l’erreur de contribution à côté de l’action manuelle",async()=>{
  await queueFreeOperation(edit(),place,place);
  f.push.mockRejectedValue(Object.assign(new Error('Fiche modifiée ailleurs.'),{code:'free/conflict'}));
  expect(await retryFreeContributions()).toContain('Fiche modifiée ailleurs.');
  expect(await f.db.freeQueue.toArray()).toHaveLength(1);
});
it("confirme l’envoi manuel seulement après vidange de la file",async()=>{
  await queueFreeOperation(edit(),place,place);
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  expect(await retryFreeContributions()).toBe('Toutes vos contributions ont été envoyées.');
  expect(await f.db.freeQueue.toArray()).toEqual([]);
});

it("envoie les contributions anciennes sans date indexable au lieu de les ignorer",async()=>{
  await f.db.freeQueue.put({id:'legacy',owner:'alice',operation:edit('legacy'),base:place,status:'pending'});
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  expect(await retryFreeContributions()).toBe('Toutes vos contributions ont été envoyées.');
  expect(f.push).toHaveBeenCalledTimes(1);
});
it("une date ancienne invalide ne contamine pas les nouveaux envois",async()=>{
  await f.db.freeQueue.put({id:'legacy',owner:'alice',operation:edit('legacy'),base:place,status:'pending',created:NaN});
  await queueFreeOperation(edit('new'),place,place);
  expect(Number.isFinite((await f.db.freeQueue.get('new')).created)).toBe(true);
});

it("récupère une création sans date avant sa photo même si les clés sont inversées",async()=>{
  const photo={...edit('a-photo'),kind:'photo.add',payload:{base64:'aGVsbG8='}};
  await f.db.freeQueue.put({id:'a-photo',owner:'alice',operation:photo,base:place,status:'pending',created:NaN});
  await f.db.freeQueue.put({id:'z-create',owner:'alice',operation:{...edit('z-create'),kind:'place.create',payload:place},status:'pending'});
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  await runFreeSync();expect(f.push.mock.calls.map(c=>c[0].kind)).toEqual(['place.create','photo.add']);
  expect(await f.db.freeQueue.toArray()).toEqual([]);
});

it('affiche le report du lieu même si ses quatre autres opérations n’ont pas de date',async()=>{
  for(let i=0;i<5;i++)await queueFreeOperation(edit(`wait-${i}`),place,place);
  const first=await f.db.freeQueue.get('wait-0');
  await f.db.freeQueue.put({...first,retryAt:Date.now()+3600000,error:'Limite quotidienne atteinte ; nouvelle tentative demain.'});
  const result=await retryFreeContributions();
  expect(result).toContain('Prochaine tentative');expect(result).not.toContain('file-non-traitee');
  expect(f.push).not.toHaveBeenCalled();
});
it('l’admin reprend immédiatement un ancien report de quota utilisateur et ses dépendances',async()=>{
  for(let i=0;i<5;i++)await queueFreeOperation(edit(`admin-${i}`),place,place);
  const first=await f.db.freeQueue.get('admin-0');
  await f.db.freeQueue.put({...first,retryAt:Date.now()+3600000,error:'Limite quotidienne atteinte ; nouvelle tentative demain.'});
  f.account.isAdmin=true;
  f.push.mockResolvedValue({id:place.id,place,reviews:[],deleted:false,updated:Date.now()});
  expect(await retryFreeContributions()).toBe('Toutes vos contributions ont été envoyées.');
  expect(f.push).toHaveBeenCalledTimes(5);
});
it('l’admin ne contourne pas une pause technique Firebase',async()=>{
  await queueFreeOperation(edit(),place,place);f.account.isAdmin=true;
  await f.db.meta.put({key:'free-sync-v1',value:{day:Date.now(),reads:0,last:0,pausedUntil:Date.now()+3600000,nextAttempt:0,failures:1,zones:{}}});
  expect(await retryFreeContributions()).toContain('différé');expect(f.push).not.toHaveBeenCalled();
});

it("conserve les photos consultées après une nouvelle révision, même sans réseau pour les recharger", async () => {
  const photo={id:"source-1_photo",url:"data:image/jpeg;base64,cGhvdG8=",user_id:"alice",caption:"",created:"2026-09-18"};
  await f.db.places.put(place);
  await f.db.details.put({...place,photos:[photo],reviews:[]});
  await applyFreeChanges([{id:place.id,place:{...place,version:9,name:"Nom corrigé"},reviews:[],deleted:false,updated:Date.now()}]);
  expect((await f.db.details.get(place.id)).photos).toEqual([photo]);
});
it("n'envoie pas les contributions quand le mode hors connexion est choisi",async()=>{
  await queueFreeOperation(edit(),place,place);
  vi.stubGlobal("localStorage",{getItem:(key:string)=>key==="map-offline"?"true":null});
  await runFreeSync();expect(f.push).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
  expect(await f.db.freeQueue.toArray()).toHaveLength(1);
});

describe("réception immédiate administrateur",()=>{
 it("rattrape une zone reportée à demain puis écoute les nouveautés sans relire une zone inchangée",async()=>{
  await runFreeSync();f.account.isAdmin=true;
  const {reserveReads}=await import('./cloud-budget');await reserveReads(50,'manual');
  await runFreeSync();await runFreeSync();
  expect(f.fetch).toHaveBeenCalledTimes(2);expect(f.watch).toHaveBeenCalledTimes(1);
  f.watch.mock.calls[0][2]();await vi.advanceTimersByTimeAsync(1000);
  expect(f.fetch).toHaveBeenCalledTimes(3);expect(f.watch).toHaveBeenCalledTimes(2);
 });
 it("récupère plus de 50 lieux en une passe admin et garde un curseur précis",async()=>{
  f.account.isAdmin=true;let total=0;
  f.fetch.mockImplementation(async(_cells:string[],_cursor:unknown,size:number)=>{
   const n=Math.min(size,63-total);total+=n;
   return {changes:Array.from({length:n},(_,i)=>({id:'p'+(total-n+i),place:{...place,id:'p'+(total-n+i)},reviews:[],deleted:false,updated:Date.now()})),cursor:{time:Date.now(),id:'p'+(total-1),seconds:1,nanoseconds:23},hasMore:n===size};
  });
  await runFreeSync();expect(total).toBe(63);expect(f.fetch).toHaveBeenCalledTimes(4);expect(f.watch.mock.calls[0][1].nanoseconds).toBe(23);
 });
 it("détache les abonnements après déconnexion",async()=>{
  f.account.isAdmin=true;await runFreeSync();const changed=f.watch.mock.calls[0][2],dispose=f.watch.mock.results[0].value;
  f.account={...f.account,isAdmin:false,uid:'bob'};await runFreeSync();changed();await vi.advanceTimersByTimeAsync(1000);
  expect(dispose).toHaveBeenCalledTimes(1);expect(f.fetch).toHaveBeenCalledTimes(1);
 });
 it("ne lit rien en arrière-plan",async()=>{f.account.isAdmin=true;vi.stubGlobal('document',{visibilityState:'hidden'});await runFreeSync();expect(f.fetch).not.toHaveBeenCalled();});
});

describe("photos à la demande sans attendre la synchronisation quotidienne",()=>{
 it("réutilise toutes les photos déjà reçues après revalidation de la révision serveur",async()=>{
  await f.db.places.put(place);await f.db.meta.put({key:`free-version:${place.id}`,value:1});
  f.previews.mockResolvedValue([{id:'photo',place_id:place.id}]);await refreshFreePreviews(place.id);await refreshFreePreviews(place.id);
  expect(f.previews).toHaveBeenCalledTimes(1);expect((await f.db.details.get(place.id)).photos).toHaveLength(1);
 });
 it("répare un ancien cache vide au premier chargement sans relire aux visites suivantes",async()=>{
  await f.db.places.put(place);await f.db.details.put({...place,photos:[],reviews:[]});
  await f.db.meta.put({key:`free-version:${place.id}`,value:1});
  await f.db.meta.put({key:`free-previews:${place.id}`,value:1});
  f.previews.mockResolvedValue([{id:"imported-photo",place_id:place.id}]);
  await cacheFreePreviews(place.id);await cacheFreePreviews(place.id);
  expect((await f.db.details.get(place.id)).photos[0].id).toBe("imported-photo");expect(f.previews).toHaveBeenCalledTimes(1);
 });
 it("une nouvelle révision photo invalide le marqueur historique même à version de fiche identique",async()=>{
  await f.db.places.put(place);await f.db.details.put({...place,photos:[{id:'old-photo',place_id:place.id}],reviews:[]});
  await f.db.meta.put({key:`free-version:${place.id}`,value:1});await f.db.meta.put({key:`free-previews:${place.id}`,value:1});
  await applyFreeChanges([{id:place.id,place:{...place,version:1,photo_count:1},reviews:[],deleted:false,updated:Date.now(),photoRevision:'1:new-photo'}]);
  f.previews.mockResolvedValue([{id:'new-photo',place_id:place.id}]);await cacheFreePreviews(place.id);
  expect((await f.db.details.get(place.id)).photos.map((p:any)=>p.id)).toEqual(['new-photo']);expect(f.previews).toHaveBeenCalledTimes(1);
 });
 it("permet de réessayer un résultat vide seulement sur demande explicite",async()=>{
  await f.db.places.put(place);f.previews.mockResolvedValue([]);await cacheFreePreviews(place.id);
  f.previews.mockResolvedValue([{id:'new-photo',place_id:place.id}]);await cacheFreePreviews(place.id);
  expect(f.previews).toHaveBeenCalledTimes(1);
  await cacheFreePreviews(place.id,true);expect(f.previews).toHaveBeenCalledTimes(2);expect((await f.db.details.get(place.id)).photos[0].id).toBe('new-photo');
 });
 it("charge les photos d’un lieu importé sans révision partagée locale",async()=>{
  await f.db.places.put(place);
  f.previews.mockResolvedValue([{id:"photo",url:"data:image/jpeg;base64,eA==",user_id:"alice"}]);
  await cacheFreePreviews(place.id);
  expect(f.previews).toHaveBeenCalledTimes(1);
  expect((await f.db.details.get(place.id)).photos[0].id).toBe("photo");
  await cacheFreePreviews(place.id);expect(f.previews).toHaveBeenCalledTimes(1);
 });
 it("un échec réseau ne marque pas les photos administrateur comme téléchargées",async()=>{
  f.account.isAdmin=true;await f.db.places.put(place);
  // Le contrôle réseau est dans le fournisseur cloud, commun à tous les appelants.
  f.previews.mockRejectedValue(Object.assign(new Error('Reporté'),{code:'free/local-read-budget'}));
  await cacheFreePreviews(place.id);expect((await f.db.meta.get(`free-preview-page:${place.id}`))).toBeUndefined();
 });
});

describe("réception dans une fiche fusionnée persistée",()=>{
 it("applique uniquement les champs modifiés d’une ancienne source",async()=>{
  const original={...place,id:"source-b",name:"Jeux",description:"Balançoire"};
  const root={...place,id:"source-a",name:"Parc",description:"Balançoire et toboggan",catalog_sources:["source-a","source-b"],catalog_version:"v1"};
  await f.db.catalogSources.put({id:original.id,canonicalId:root.id,place:original});
  await f.db.places.put(root);
  await f.db.details.put({...root,photos:[{id:"photo-a",place_id:root.id}],reviews:[]});
  await applyFreeChanges([{id:original.id,place:{...original,wheelchair:true,version:9},reviews:[{id:"bob",stars:5} as any],deleted:false,updated:Date.now()}]);
  const result=await f.db.places.get(root.id);
  expect(result.description).toBe("Balançoire et toboggan");expect(result.name).toBe("Parc");expect(result.wheelchair).toBe(true);
  expect((await f.db.details.get(root.id)).reviews[0].place_id).toBe(original.id);
  expect((await f.db.details.get(root.id)).photos).toHaveLength(1);
  expect(await f.db.places.get(original.id)).toBeUndefined();
 });
 it("une suppression du lieu canonique masque toutes les anciennes sources",async()=>{
  await f.db.places.put({...place,id:"a",catalog_sources:["a","b"]});await f.db.places.put({...place,id:"b",redirect:"a"});
  await applyFreeChanges([{id:"a",place:null,reviews:[],deleted:true,updated:Date.now()}]);
  expect(await f.db.places.get("a")).toBeUndefined();expect(await f.db.places.get("b")).toBeUndefined();
  expect(await f.db.removed.get("b")).toEqual({id:"b"});
 });
});

it("ne remplace pas les photos par une réponse périmée après modification d’un alias",async()=>{
 const root={...place,catalog_sources:[place.id,"alias"],catalog_version:"v1"};
 const original={...place,id:"alias"};
 await f.db.places.put(root);
 await f.db.catalogSources.put({id:"alias",canonicalId:place.id,place:original});
 await f.db.details.put({...root,photos:[{id:"kept",place_id:place.id}],reviews:[]});
 let started!:()=>void, finish!:(photos:any[])=>void;
 const beginning=new Promise<void>(resolve=>started=resolve);
 f.previews.mockImplementation(()=>{started();return new Promise(resolve=>finish=resolve);});
 const pending=cacheFreePreviews(place.id);await beginning;
 await applyFreeChanges([{id:"alias",place:{...original,wheelchair:true},reviews:[],deleted:false,updated:Date.now()}]);
 finish([]);await pending;
 expect((await f.db.details.get(place.id)).photos.map((p:any)=>p.id)).toEqual(["kept"]);
 expect(await f.db.meta.get(`free-previews:${place.id}`)).toBeUndefined();
});

it('une correction du nom ne recharge pas les photos déjà enregistrées',async()=>{
 await f.db.places.put(place);await f.db.meta.put({key:`free-version:${place.id}`,value:2});
 f.previews.mockResolvedValue([{id:'photo',place_id:place.id,url:'data:image/webp;base64,eA=='}]);await cacheFreePreviews(place.id);
 await applyFreeChanges([{id:place.id,place:{...place,version:3,name:'Nouveau nom'},reviews:[],deleted:false,updated:Date.now()}]);
 await cacheFreePreviews(place.id);expect(f.previews).toHaveBeenCalledTimes(1);
});

it('rend à nouveau visible un avis republié après une suppression, sans rétablir les autres avis retirés', async()=>{
 await f.db.places.put(place);
 await f.db.personal.put({id:place.id,patch:{},removedReviews:['alice','other'],photos:[],review:{id:'local-new',user_id:'personal-device',stars:4,text:'Nouvel avis'}});
 await queueFreeOperation({id:'new-review',place_id:place.id,kind:'review.save',payload:{stars:4,text:'Nouvel avis'}},place,place);
 f.push.mockResolvedValue({id:place.id,place:{...place,version:1},reviews:[{id:'alice',user_id:'alice',stars:4,text:'Nouvel avis'}],deleted:false,updated:Date.now()});
 await runFreeSync();
 expect((await f.db.personal.get(place.id)).removedReviews).toEqual(['other']);
 expect((await f.db.personal.get(place.id)).review).toBeUndefined();
});


describe('fiche administrateur en temps réel',()=>{
 it('récupère les photos même si une consultation précédente avait enregistré une réponse vide',async()=>{
  f.account.isAdmin=true;await f.db.places.put(place);f.previews.mockResolvedValue([]);
  await cacheFreePreviews(place.id);
  const stop=watchAdminDetail(place.id);await vi.waitFor(()=>expect(f.watchPlace).toHaveBeenCalledTimes(1));
  f.previews.mockResolvedValue([{id:'new-photo',place_id:place.id,url:'data:image/webp;base64,eA=='}]);
  f.watchPlace.mock.calls[0][1]({id:place.id,place:{...place,version:1,photo_count:1},reviews:[],deleted:false,updated:Date.now(),photoRevision:'1:new-photo'});
  await vi.waitFor(()=>expect(f.db.details.rows.get(place.id)?.photos[0]?.id).toBe('new-photo'));
  stop();expect(f.watchPlace.mock.results[0].value).toHaveBeenCalledTimes(1);
 });
 it('ignore une notification reçue après fermeture ou changement de compte',async()=>{
  f.account.isAdmin=true;await f.db.places.put(place);
  const stop=watchAdminDetail(place.id);await vi.waitFor(()=>expect(f.watchPlace).toHaveBeenCalledTimes(1));
  stop();f.watchPlace.mock.calls[0][1]({id:place.id,place:{...place,name:'Périmé'},reviews:[],deleted:false,updated:0});
  await Promise.resolve();await Promise.resolve();expect((await f.db.places.get(place.id)).name).toBe(place.name);
 });
 it('n’écoute aucune fiche pour un compte ordinaire ou hors connexion',async()=>{
  watchAdminDetail(place.id);f.account.isAdmin=true;vi.stubGlobal('navigator',{onLine:false});watchAdminDetail(place.id);
  await Promise.resolve();expect(f.watchPlace).not.toHaveBeenCalled();
 });
});

it('ne remplace pas une fiche reçue en direct par une ancienne page de rattrapage',async()=>{
 await f.db.places.put(place);
 await applyFreeChanges([{id:place.id,place:{...place,version:12,name:'Récent'},reviews:[],deleted:false,updated:12}]);
 await applyFreeChanges([{id:place.id,place:{...place,version:10,name:'Ancien'},reviews:[],deleted:false,updated:10}]);
 expect((await f.db.places.get(place.id)).name).toBe('Récent');expect((await f.db.meta.get(`free-version:${place.id}`)).value).toBe(12);
});

it('ignore les instantanés déjà appliqués sans réécrire les fiches ou invalider leurs photos',async()=>{
 const change={id:place.id,place,reviews:[],deleted:false,updated:123,photoRevision:'photo-8'};
 expect(await applyFreeChanges([change])).toBe(true);
 const put=vi.spyOn(f.db.places,'put');
 expect(await applyFreeChanges([change])).toBe(false);expect(put).not.toHaveBeenCalled();put.mockRestore();
 expect(await applyFreeChanges([{...change,place:{...place,version:9,name:'Correction'}}])).toBe(true);
 expect((await f.db.places.get(place.id)).name).toBe('Correction');
});

it('ne reconsulte pas les photos absentes tant que leur révision ne change pas',async()=>{
 await f.db.places.put(place);f.previews.mockResolvedValue([]);
 await refreshFreePreviews(place.id);await refreshFreePreviews(place.id);await refreshFreePreviews(place.id);
 expect(f.previews).toHaveBeenCalledTimes(1);
 await refreshFreePreviews(place.id,true);expect(f.previews).toHaveBeenCalledTimes(2);
});
it('un retour sans contribution ni zone périmée ne relit pas le serveur et ne redessine pas l’interface',async()=>{
 await runFreeSync();f.fetch.mockClear();f.push.mockClear();f.notify.mockClear();
 await runFreeSync();
 expect(f.fetch).not.toHaveBeenCalled();expect(f.push).not.toHaveBeenCalled();expect(f.notify).not.toHaveBeenCalled();
});
