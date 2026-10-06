import Dexie from "dexie";
import {AdminLive} from "./admin-live";
import { convertPhotoUrl } from "./photo-input";
import { receiveCanonicalSource } from "./canonical-store";
import {photoSourceIds,type DetailSources} from './detail-sources';
import {isAutomaticReadLimit} from "./cloud-budget";
import { offlineMap } from "./map-cache";
import { accountDeletionInProgress } from './free-cloud';
import { db, notify } from "./store";
import { freeCollaborationEnabled, freeReadsLeft, watchFreeChanges, watchFreePlace, getFreeSession, pushFreeOperation, fetchFreeChanges, syncFreePrivateDecisions, fetchFreePreviewPage, type PreviewCursor, type FreeSharedPlace } from "./free-cloud";
import { sharedCells } from "./free-policy";
import { FREE_DAY, FREE_DAILY_READS, nextQueueAttempt, freeFailure, initialFreeSyncMeta, shareableFreeOperation, type FreeSyncMeta, type FreeQueueItem } from "./free-sync-policy";
import type { Op, Place, Origin } from "./types";
import { LYON } from "./types";
// Seul l'administrateur écoute les nouveautés, dans les zones consultées.
const adminLive=new AdminLive(watchFreeChanges);
let adminOwner='';
const adminReady=new Set<string>();
let adminSyncAgain=false;
const adminDetails=new Map<()=>void,string>();
export function stopAdminLive() {
 adminLive.clear();adminReady.clear();adminOwner='';adminSyncAgain=false;
 for(const stop of adminDetails.keys())stop();adminDetails.clear();
 clearTimeout(retryTimer);
}
function adminLiveFailed(error:unknown) {
 stopAdminLive();
 // Les limites réelles de Firebase restent applicables, y compris pour l'administrateur.
 void (async()=>{
  const meta=((await db.meta.get(META))?.value as FreeSyncMeta|undefined)||initialFreeSyncMeta();
  const failure=freeFailure(error,Date.now(),meta.failures++);
  meta.pausedUntil=failure.pause;meta.nextAttempt=failure.retry;
  await db.meta.put({key:META,value:meta});
  freeSyncState.pausedUntil=failure.pause;freeSyncState.nextAttempt=failure.retry;
  freeSyncState.message=failure.pause?'Quota gratuit Firebase atteint : actualisation suspendue.':'Actualisation en temps réel indisponible.';
  notify();if(failure.pause||failure.retry)scheduleFreeSync(Math.max(failure.pause,failure.retry));
 })();
}
const META = "free-sync-v1";
export const freeSyncState = { busy: false, message: "", last: 0, pausedUntil: 0, nextAttempt: 0 };
let running: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFreeSync(at: number) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void runFreeSync(), Math.max(1000, Math.ceil(at - Date.now())));
}

// Lire la table entière : un index IndexedDB omet les dates absentes/NaN.
// Les anciennes lignes restent conservées, y compris leurs identifiants idempotents.
function queueTime(value: unknown): number {
  if(typeof value==='number' && Number.isFinite(value))return value;
  if(typeof value==='string'){const parsed=Date.parse(value);if(Number.isFinite(parsed))return parsed;}
  return 0;
}
async function ownedQueue(uid:string):Promise<FreeQueueItem[]> {
  const rows=(await db.freeQueue.toArray()).filter(q=>q.owner===uid);
  rows.sort((a,b)=> {
    // Une création doit précéder ses photos et corrections, même sans ancienne date.
    if(a.operation.kind!==b.operation.kind){
      if(a.operation.kind==='place.create')return -1;
      if(b.operation.kind==='place.create')return 1;
    }
    return queueTime(a.created)-queueTime(b.created);
  });
  for(let i=0;i<rows.length;i++) {
    const row=rows[i];
    if(typeof row.created!=="number" || !Number.isFinite(row.created)) {
      row.created=queueTime(row.created);
      await db.freeQueue.put(row);
    }
  }
  return rows;
}

// La chaîne Dexie garde le même contexte pour l’avis local et sa file d’envoi.
export function queueFreeOperation(op: Op, base?: Place, current?: Place): Promise<void> {
  const account = getFreeSession();
  if (!freeCollaborationEnabled || !account?.verified || !account.termsAccepted || account.blocked) return Promise.resolve();
  return db.freeQueue.toArray().then(queued => {
    const cancelled = op.kind === "review.delete"
      ? queued.filter(q => q.owner === account.uid && q.operation.place_id === op.place_id && q.operation.kind === "review.save")
      : op.kind === "photo.delete" && !String(op.payload.photo_id).startsWith(`${op.place_id}_`)
        ? queued.filter(q => q.id === op.payload.photo_id && q.owner === account.uid && q.operation.place_id === op.place_id && q.operation.kind === "photo.add")
        : [];
    return Dexie.Promise.all(cancelled.map(q => db.freeQueue.delete(q.id))).then(() => {
      if (op.kind === "review.delete") {
        if (op.payload.review_id !== account.uid) return;
        op = { ...op, payload: { id: account.uid } };
      }
      if (op.kind === "photo.delete" && !String(op.payload.photo_id).startsWith(`${op.place_id}_`)) return;
      if (!base && op.kind !== "place.create") {
        const created = queued.find(q => q.owner === account.uid && q.operation.place_id === op.place_id && q.operation.kind === "place.create");
        if (created) base = { ...created.operation.payload, id: op.place_id, version: 0 } as unknown as Place;
      }
      const operation = shareableFreeOperation(op, base, current);
      if (!operation) return;
      // Les corrections privées ne deviennent jamais la version de référence publiée.
      return db.meta.get(`free-version:${op.place_id}`).then(row => db.freeQueue.put({
        id: op.id, owner: account.uid,
        operation: { ...operation, base_version: Number(row?.value || 0) },
        ...(base ? { base } : {}),
        created: queued.reduce((latest, item) => Math.max(latest, queueTime(item.created) + 1), Date.now()),
        status: "pending",
      })).then(() => undefined);
    });
  });
}

export async function applyFreeChanges(changes: FreeSharedPlace[]) {
  let changed=false;
  await db.transaction("rw", ["places", "details", "personal", "removed", "favorites", "meta", "catalogSources", "sourceRevisions"], async () => {
    for (const change of changes) {
      const id = change.id;
      const photoKey=`photo-revision:${id}`;
      const oldPhotoRevision=(await db.meta.get(photoKey))?.value;
      const previousVersion=(await db.meta.get(`free-version:${id}`))?.value;
      // Une écoute directe peut recevoir la version actuelle avant le rattrapage d'une zone.
      if(change.place && typeof previousVersion==='number' && change.place.version<previousVersion)continue;
      const signature=JSON.stringify([change.deleted,change.place,change.reviews,change.photoRevision]);
      if((await db.meta.get(`free-applied:${id}`))?.value===signature)continue;
      changed=true;
      await db.meta.put({key:`free-applied:${id}`,value:signature});
      if(change.photoRevision){
        await db.meta.put({key:photoKey,value:change.photoRevision});
        if(change.photoRevision!==oldPhotoRevision)await db.meta.delete(`free-previews:${id}`);
      }
      else if(oldPhotoRevision===undefined && previousVersion!==undefined)await db.meta.put({key:photoKey,value:previousVersion});
      if (change.deleted) {
        const original=await db.places.get(id);
        for(const removedId of original?.catalog_sources||[id]) {
          await db.removed.put({id:removedId});
          await db.places.delete(removedId);await db.details.delete(removedId);
          await db.personal.delete(removedId);await db.favorites.delete(removedId);
        }
        const link=await db.catalogSources.get(id);
        if(link && link.canonicalId!==id) {
          const root=await db.details.get(link.canonicalId);
          if(root) {
            const photos=root.photos.filter(p=>p.place_id!==id), reviews=root.reviews.filter(r=>r.place_id!==id);
            const counts={photo_count:photos.length,review_count:reviews.length,rating:reviews.length?reviews.reduce((n,r)=>n+r.stars,0)/reviews.length:0};
            await db.details.put({...root,...counts,photos,reviews});
            const place=await db.places.get(link.canonicalId);
            if(place)await db.places.put({...place,...counts});
          }
          const epoch=Number((await db.meta.get(`preview-epoch:${link.canonicalId}`))?.value||0);
          await db.meta.put({key:`preview-epoch:${link.canonicalId}`,value:epoch+1});
          await db.meta.delete(`free-previews:${link.canonicalId}`);
        }
      } else if (change.place && !(await db.removed.get(id))) {
        if(await receiveCanonicalSource(id,change.place,change.reviews)) {
          await db.meta.put({key:`free-version:${id}`,value:change.place.version||change.updated});
          continue;
        }
        const existing = await db.details.get(id);
        const imported = await db.places.get(id);
        const place = { ...imported, ...change.place, sources: imported?.sources?.length ? imported.sources : change.place.sources };
        await db.places.put(place);
        await db.details.put({ ...place, reviews: change.reviews, photos: existing?.photos || [] });
      }
      await db.meta.put({ key: `free-version:${id}`, value: change.place?.version || change.updated });
    }
  });
  return changed;
}

export function waitForFreeSync(): Promise<void> {return running || Promise.resolve();}
export function runFreeSync(): Promise<void> {
  if(accountDeletionInProgress()){freeSyncState.message="Suppression du compte en cours : envoi suspendu.";notify();return Promise.resolve();}
  if (!freeCollaborationEnabled || document.visibilityState === "hidden" || offlineMap()) {
    stopAdminLive();
    freeSyncState.message = !freeCollaborationEnabled ? "Partage désactivé." : offlineMap() ? "Connexion Internet indisponible." : "Application considérée en arrière-plan : revenez dans l’application.";
    notify();return Promise.resolve();
  }
  const account=getFreeSession();
  if(!account?.isAdmin)stopAdminLive();
  else if(adminOwner!==account.uid){
    adminLive.clear();adminReady.clear();adminOwner=account.uid;adminSyncAgain=false;
    for(const [stop,owner]of adminDetails)if(owner!==account.uid)stop();
  }
  if (running) return running;
  // Le navigateur partage ce verrou entre les onglets d’un même appareil.
  const previousState=JSON.stringify(freeSyncState);
  const task = navigator.locks
    ? navigator.locks.request("cailloute-free-sync", { ifAvailable: true }, lock => { if (lock) return perform(); freeSyncState.message="Un autre échange est en cours. Nouvelle tentative dans une seconde."; scheduleFreeSync(Date.now() + 1000); return Promise.resolve(); })
    : perform();
  running = task.finally(() => {
    running = null;freeSyncState.busy = false;
    if(previousState!==JSON.stringify(freeSyncState))notify();
    if(adminSyncAgain){adminSyncAgain=false;scheduleFreeSync(Date.now());}
  });
  return running;
}
export async function retryFreeContributions(): Promise<string> {
  const account=getFreeSession();
  if(!account) return "Reconnectez-vous pour envoyer vos contributions.";
  if(!account.verified) return "Vérifiez votre adresse e-mail avant l’envoi.";
  const before=(await db.freeQueue.toArray()).filter(q=>q.owner===account.uid).length;
  await runFreeSync();
  if(getFreeSession()?.uid!==account.uid) return "Le compte a changé pendant l’envoi.";
  const remaining=(await db.freeQueue.toArray()).filter(q=>q.owner===account.uid);
  if(!remaining.length) return "Toutes vos contributions ont été envoyées.";
  const errors=remaining.filter(q=>q.status==='error');
  const sent=Math.max(0,before-remaining.length);
  const prefix=sent ? `${sent} contribution(s) envoyée(s). ` : "Aucune contribution envoyée. ";
  if(errors.length) return prefix + errors.map(q=>q.error||"Contribution à vérifier.").filter((v,i,a)=>a.indexOf(v)===i).join(" ");
  if(freeSyncState.message) return prefix+freeSyncState.message;
  const next=Math.max(freeSyncState.pausedUntil,freeSyncState.nextAttempt,nextQueueAttempt(remaining,Date.now()));
  if(next>Date.now())return prefix+`Prochaine tentative : ${new Date(next).toLocaleString("fr-FR")}.`;
  const states=[...new Set(remaining.map(q=>String(q.status||"absent")))].join(", ");
  return prefix+`${remaining.length} encore en attente. Référence : file-non-traitee (${states}).`;
}
async function perform() {
  const meta = ((await db.meta.get(META))?.value as FreeSyncMeta | undefined) || initialFreeSyncMeta();
  const beforeMeta=JSON.stringify(meta);
  const now = Date.now();
  freeSyncState.last = meta.last; freeSyncState.pausedUntil = meta.pausedUntil; freeSyncState.nextAttempt=meta.nextAttempt;
  if (now < Math.max(meta.pausedUntil, meta.nextAttempt)) { freeSyncState.message=`Envoi différé jusqu’au ${new Date(Math.max(meta.pausedUntil,meta.nextAttempt)).toLocaleString("fr-FR")}.`; scheduleFreeSync(Math.max(meta.pausedUntil, meta.nextAttempt)); return; }
  if (now - meta.day >= FREE_DAY) { meta.day = now; meta.reads = 0; }
  freeSyncState.message = "";
  const begin=()=>{if(!freeSyncState.busy){freeSyncState.busy=true;notify();}};
  try {
    const account = getFreeSession();
    if (account?.verified) {
      const owned = await ownedQueue(account.uid);
      // Un ancien report de quota utilisateur ne s’applique plus à un administrateur.
      // Les pauses techniques Firebase restent intégralement respectées.
      if(account.isAdmin) for(const item of owned) {
        if(item.status==='pending' && item.error==='Limite quotidienne atteinte ; nouvelle tentative demain.') {
          delete item.retryAt; delete item.error; await db.freeQueue.put(item);
        }
      }
      const blockedPlaces = new Set(owned.filter(q => q.status === "error" || (q.retryAt || 0) > now).map(q => q.operation.place_id));
      const pending = owned.filter(q => q.status === "pending" && !blockedPlaces.has(q.operation.place_id)).slice(0, 5);
      for (const item of pending) {
        if (getFreeSession()?.uid !== account.uid) break;
        if (blockedPlaces.has(item.operation.place_id)) continue;
        const currentItem = await db.freeQueue.get(item.id);
        if (!currentItem) continue;
        item.operation = currentItem.operation;
        try {
          begin();
          const result = await pushFreeOperation(item.operation, item.base);
          // An account change must never consume another account’s pending queue.
          if (getFreeSession()?.uid !== account.uid) break;
          await applyFreeChanges([result]);
          const storageId=(await db.catalogSources.get(item.operation.place_id))?.canonicalId || item.operation.place_id;
          await db.transaction("rw", ["freeQueue", "personal", "details", "places", "meta"], async () => {
            const local = await db.personal.get(item.operation.place_id);
            if (result.savedPhoto) {
              const detail = await db.details.get(storageId);
              if (detail) {
                const photos=[...detail.photos.filter(p => p.id !== result.savedPhoto!.id), {...result.savedPhoto,place_id:item.operation.place_id}];
                await db.details.put({...detail,photos,photo_count:photos.length});
                const p=await db.places.get(storageId);if(p)await db.places.put({...p,photo_count:photos.length});
              }
              if (local) { local.photos = local.photos.filter(photo => photo.id !== item.id); await db.personal.put(local); }
            }
            if (item.operation.kind === "photo.delete") {
              const detail = await db.details.get(storageId);
              if (detail) {
                const photos=detail.photos.filter(photo => photo.id !== item.operation.payload.id);
                await db.details.put({...detail,photos,photo_count:photos.length});
                const place=await db.places.get(storageId);
                if(place)await db.places.put({...place,photo_count:photos.length});
              }
            }

            if (local && item.operation.kind === "place.edit") {
              for (const [key, value] of Object.entries(item.operation.payload))
                if (JSON.stringify(local.patch[key as keyof Place]) === JSON.stringify(value)) delete local.patch[key as keyof Place];
              await db.personal.put(local);
            }
            if (local && item.operation.kind === "review.save" && local.review?.text === item.operation.payload.text && local.review?.stars === item.operation.payload.stars) {
              const published=result.reviews.find(r=>r.user_id===account.uid);
              if(published) local.removedReviews=local.removedReviews.filter(id=>id!==published.id);
              delete local.review; await db.personal.put(local);
            }
            const successors = (await db.freeQueue.toArray()).filter(q => q.owner === item.owner && q.operation.place_id === item.operation.place_id && q.created >= item.created && q.id !== item.id && q.operation.base_version === item.operation.base_version);
            for (const next of successors) await db.freeQueue.put({ ...next, operation: { ...next.operation, base_version: result.place?.version || 0 } });
            await db.freeQueue.delete(item.id);
          });
        } catch (error) {
          if ((error as { code?: string }).code === "free/daily-quota") {
            const nextDay = new Date(); nextDay.setUTCHours(24, 0, 0, 0);
            await db.freeQueue.put({ ...item, retryAt: nextDay.getTime(), status: "pending", error: "Limite quotidienne atteinte ; nouvelle tentative demain." });
            blockedPlaces.add(item.operation.place_id);
            continue;
          }
          const failure = freeFailure(error, Date.now(), meta.failures);
          if (!failure.permanent) throw error;
          await db.freeQueue.put({ ...item, status: "error", error: (error as Error).message });
          blockedPlaces.add(item.operation.place_id);
        }
      }
    }
    // Les envois précèdent toujours les lectures automatiques.
    if(account?.verified){
      const key=`private-report-poll:${account.uid}`;
      if((Number((await db.meta.get(key))?.value)||0)+FREE_DAY<=now && await freeReadsLeft()>=14){
        try{begin();meta.reads+=await syncFreePrivateDecisions(10);await db.meta.put({key,value:now});}catch(error){if(!isAutomaticReadLimit(error))throw error;}
      }
    }
    let origin: Origin = LYON;
    try { origin = JSON.parse(localStorage.getItem("origin") || "null") || LYON; const view=JSON.parse(localStorage.getItem("mapView")||"null");if(Array.isArray(view)&&Number.isFinite(view[0])&&Number.isFinite(view[1]))origin={...origin,lat:view[0],lon:view[1]}; } catch { /* default */ }
    const cells = sharedCells(origin);
    const admin=!!account?.isAdmin;
    const readLimit = admin ? Infinity : FREE_DAILY_READS;
    for (const cell of cells) {
      const zone = meta.zones[cell] ||= { cursor: null, next: 0, visited: now };
      if(now-zone.visited>=300000)zone.visited = now;
    }
    // Keep just the last 12 visited cells; each has its own stable pagination cursor.
    const retained = Object.entries(meta.zones).sort((a, b) => b[1].visited - a[1].visited).slice(0, 12);
    meta.zones = Object.fromEntries(retained);
    for (const [cell, zone] of [...retained].sort((a, b) => a[1].next - b[1].next)) {
      if(!cells.includes(cell) || (admin ? adminReady.has(cell) : zone.next > now) || meta.reads >= readLimit)continue;
      const limit = Math.min(20, readLimit - meta.reads, (await freeReadsLeft())-2);
      if(limit<1)break;
      // Reserve before sending: a lost response still consumes the read allowance.
      meta.reads += limit;
      await db.meta.put({ key: META, value: meta });
      begin();
      let result=await fetchFreeChanges([cell],zone.cursor,limit);
      meta.reads-=limit-Math.max(1,result.changes.length);
      for(;;){
        if(admin && getFreeSession()?.uid!==account?.uid)return;
        await applyFreeChanges(result.changes);
        if(result.cursor)zone.cursor=result.cursor;
        zone.next=result.hasMore?0:now+FREE_DAY+Math.random()*3600000;
        meta.last=Date.now();
        if(!admin || !result.hasMore)break;
        // Rattraper immédiatement toutes les pages, sans limite quotidienne locale.
        // Arrêter dès que la connexion, le compte ou la visibilité changent.
        if(offlineMap() || document.visibilityState==='hidden'){stopAdminLive();return;}
        await db.meta.put({key:META,value:meta});
        result=await fetchFreeChanges([cell],zone.cursor,20);
        meta.reads+=Math.max(1,result.changes.length);
      }
      if(admin)adminReady.add(cell);
    }
    if(admin && getFreeSession()?.uid===account?.uid && !offlineMap() && document.visibilityState!=='hidden'){
      adminLive.update(account!.uid,Object.fromEntries(cells.map(cell=>[cell,meta.zones[cell]])),cell=>{
        adminReady.delete(cell);adminSyncAgain=true;
        if(!running){adminSyncAgain=false;scheduleFreeSync(Date.now());}
      },adminLiveFailed);
    }
    meta.failures = 0; meta.nextAttempt = 0; meta.pausedUntil = 0;
    freeSyncState.last = meta.last; freeSyncState.pausedUntil = 0; freeSyncState.nextAttempt=0;
  } catch (error) {
    stopAdminLive();
    if(isAutomaticReadLimit(error)){freeSyncState.message="Actualisation automatique reportée à demain.";return;}
    const failure = freeFailure(error, Date.now(), meta.failures++);
    meta.pausedUntil = failure.pause; meta.nextAttempt = failure.retry;
    freeSyncState.pausedUntil = failure.pause; freeSyncState.nextAttempt=failure.retry;
    freeSyncState.message = failure.pause ? "Quota gratuit atteint : échanges en pause, données conservées sur l’appareil."
      : "Échanges indisponibles pour le moment. Vos changements restent sur cet appareil.";
    const code=String((error as {code?:string;name?:string})?.code || (error as Error)?.name || "inconnu");
    freeSyncState.message += ` Référence : ${code}.`;
    clearTimeout(retryTimer);
    // Respecter le délai réseau/quota, puis reprendre tant que l’application est visible.
    if (failure.retry || failure.pause) scheduleFreeSync(Math.max(failure.retry, failure.pause));
  } finally {
    if(beforeMeta!==JSON.stringify(meta))await db.meta.put({ key: META, value: meta });
    const account=getFreeSession();
    if(account?.verified && Math.max(meta.pausedUntil,meta.nextAttempt)<=Date.now()) {
      const remaining=(await db.freeQueue.toArray()).filter(q=>q.owner===account.uid);
      const blocked=new Set(remaining.filter(q=>q.status==='error'||(q.retryAt||0)>Date.now()).map(q=>q.operation.place_id));
      if(remaining.some(q=>q.status==='pending'&&!blocked.has(q.operation.place_id))) scheduleFreeSync(Date.now()+1000);
      else {
        const future=remaining.filter(q=>q.status==='pending'&&(q.retryAt||0)>Date.now()).map(q=>q.retryAt!);
        if(future.length) scheduleFreeSync(Math.min(...future));
      }
    }
  }
}
export async function discardFreeOperation(id: string) {
  const item = await db.freeQueue.get(id);
  if (item?.owner !== getFreeSession()?.uid) return;
  await db.freeQueue.delete(id); notify();
}

const previewRequests = new Map<string, Promise<void>>();
export type PreviewState={revision:unknown;cursor:PreviewCursor;hasMore:boolean;checked:number};
export async function refreshFreePreviews(id:string,force=false):Promise<void>{
 await previewRequests.get(id);
 const previous=(await db.meta.get(`free-preview-page:${id}`))?.value as PreviewState|undefined;
 // Un ancien cache sans pagination ne garantit pas que toutes les photos ont été reçues.
 if(previous?.cursor.source===Number.MAX_SAFE_INTEGER)await db.meta.bulkDelete([`free-preview-page:${id}`,`free-previews:${id}`]);
 let races=0;
 for(;;){
  await cacheFreePreviews(id,true,force);
  const page=(await db.meta.get(`free-preview-page:${id}`))?.value as PreviewState|undefined;
  if(!page&&!offlineMap()){
   if(races++<2)continue;
   throw Error('La fiche a changé pendant le chargement des photos. Réessayez.');
  }
  if(!page?.hasMore)return;
 }
}
export function cacheFreePreviews(id:string,more=false,retryEmptyAllowed=true):Promise<void>{
 if(!freeCollaborationEnabled || offlineMap())return Promise.resolve();
 const current=previewRequests.get(id);if(current)return current;
 const request=loadPreviews(id,more,retryEmptyAllowed).catch(error=>{if(more)throw error;}).finally(()=>previewRequests.delete(id));
 previewRequests.set(id,request);return request;
}
async function loadPreviews(id:string,more:boolean,retryEmptyAllowed:boolean){
 const now=Date.now(),version=(await db.meta.get(`free-version:${id}`))?.value,epoch=(await db.meta.get(`preview-epoch:${id}`))?.value;
 const sourcePlace=await db.places.get(id);
 const sourceIds=sourcePlace?photoSourceIds(sourcePlace,(await db.meta.get(`detail-sources:${id}`))?.value as DetailSources|undefined):[id];
 const excluded=await Promise.all(sourceIds.map(source=>db.removed.get(source)));
 const sources=sourceIds.filter((_,i)=>!excluded[i]);
 const photoRevisions=await Promise.all(sources.map(async source=>(await db.meta.get(`photo-revision:${source}`))?.value??(await db.meta.get(`free-version:${source}`))?.value??`unversioned:${Math.floor(now/FREE_DAY)}`));
 const revision=JSON.stringify([sources,photoRevisions]);
 const key=`free-preview-page:${id}`,cached=(await db.meta.get(key))?.value as PreviewState|undefined;
 // Une tentative explicite peut réparer un ancien résultat vide ; les visites
 // automatiques continuent à réutiliser le cache sans requête supplémentaire.
 const retryEmpty=retryEmptyAllowed && more && cached?.revision===revision && !cached.hasMore && !(await db.details.get(id))?.photos.length;
 if(cached?.revision===revision && !retryEmpty && (!more || !cached.hasMore))return;
 const legacy=(await db.meta.get(`free-previews:${id}`))?.value;
 if(!cached && !more && legacy===(version??`unversioned:${Math.floor(now/FREE_DAY)}`)){
  const detail=await db.details.get(id);if(detail?.photos.length){await db.meta.put({key,value:{revision,cursor:{source:Number.MAX_SAFE_INTEGER},hasMore:false,checked:now}});return;}
 }
 const continuing=cached?.revision===revision && !retryEmpty;
 const page=await fetchFreePreviewPage(sources,continuing?cached.cursor:undefined,more?'manual':'automatic');
 for(const photo of page.photos){if(photo.url)try{photo.url=await convertPhotoUrl(photo.url);}catch{/* Garder la copie lisible. */}}
 await db.transaction('rw',db.details,db.places,db.meta,async()=>{
  const saved=await db.details.get(id),source=await db.places.get(id),detail=saved||(source?{...source,photos:[],reviews:[]}:undefined);
  if(!detail || (await db.meta.get(`free-version:${id}`))?.value!==version || (await db.meta.get(`preview-epoch:${id}`))?.value!==epoch)return;
  const old=continuing?detail.photos:detail.photos.filter(p=>!sources.includes(p.place_id||id)&&!sources.some(source=>p.id.startsWith(`${source}_`)));
  const photos=[...old.filter(p=>!page.photos.some(next=>next.id===p.id)),...page.photos];
  const photo_count=page.hasMore?Math.max(source?.photo_count||0,photos.length):photos.length;
  await db.details.put({...detail,photos,photo_count});if(source)await db.places.put({...source,photo_count});
  await db.meta.put({key,value:{revision,cursor:page.cursor,hasMore:page.hasMore,checked:now}});
  // Conservé pour les anciennes révisions et les migrations.
  await db.meta.put({key:`free-previews:${id}`,value:version??`unversioned:${Math.floor(now/FREE_DAY)}`});
 });notify();
}


/** Une seule fiche ouverte ; ses anciennes sources restent synchronisées séparément. */
export function watchAdminDetail(id:string):()=>void {
 const owner=getFreeSession();
 if(!owner?.isAdmin || !freeCollaborationEnabled || offlineMap() || document.visibilityState==='hidden')return ()=>{};
 let active=true,chain=Promise.resolve();const stops:Array<()=>void>=[];
 const valid=()=>active && getFreeSession()?.uid===owner.uid && !!getFreeSession()?.isAdmin && !offlineMap() && document.visibilityState!=='hidden';
 const stop=()=>{active=false;for(const dispose of stops)dispose();adminDetails.delete(stop);};
 adminDetails.set(stop,owner.uid);
 void (async()=>{
  const sourcePlace=await db.places.get(id);
  const sources=sourcePlace?photoSourceIds(sourcePlace,(await db.meta.get(`detail-sources:${id}`))?.value as DetailSources|undefined):[id];
  for(const source of sources){
   if(!valid())return;
   stops.push(watchFreePlace(source,change=>{
    chain=chain.then(async()=>{
      if(!valid())return;
      const changed=await applyFreeChanges([change]);
      if(!valid() || !changed)return;
      await cacheFreePreviews(id);notify();
    }).catch(error=>{if(valid())adminLiveFailed(error);});
   },error=>{if(valid())adminLiveFailed(error);}));
  }
 })().catch(error=>{if(valid())adminLiveFailed(error);});
 return stop;
}
