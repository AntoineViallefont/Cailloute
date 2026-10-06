import {isFreeAdminIdentity} from "./free-admin";
import { isHelpfulReview } from './review-rewards';
import { nickname } from './nickname';
import { nativeGoogleLogin } from './google-native-login';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, signInWithCredential, signInWithPopup, GoogleAuthProvider, getAuth, connectAuthEmulator, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInAnonymously, deleteUser, sendEmailVerification, sendPasswordResetEmail, updateProfile, reload, type User as FirebaseUser } from 'firebase/auth';
import { onSnapshot, getFirestore, connectFirestoreEmulator, doc, getDocFromServer as rawGetDoc, getDocsFromServer as rawGetDocs, setDoc as rawSetDoc, deleteDoc as rawDeleteDoc, updateDoc as rawUpdateDoc, collection, query, where, orderBy, startAfter, limit as queryLimit, runTransaction as rawRunTransaction, serverTimestamp, Timestamp, documentId, type QuerySnapshot, type Query, type DocumentData, type QueryConstraint } from 'firebase/firestore';
import type { Op, Place, Review, Photo } from './types';
import { FREE_TERMS_VERSION, FREE_LIMITS, FREE_PAGE_SIZE, FREE_STORAGE_LIMITS, sharedCell } from './free-policy';


import {reserveReads,automaticReadsLeft,isAutomaticReadLimit,type ReadMode} from './cloud-budget';
// Inclut une provision de deux lectures dépendantes des règles ; ce compteur reste une estimation locale.
async function readDocs<T,U extends DocumentData>(ref:Query<T,U>,maximum:number,mode:ReadMode='manual') {
 const settle=await reserveAccountReads(maximum+2,mode);
 const snapshot=await rawGetDocs(ref);await settle(Math.max(1,snapshot.size)+2);return snapshot;
}
const setDoc:typeof rawSetDoc=(async(...args:unknown[])=>{await reserveAccountReads(3,'manual');return (rawSetDoc as (...args:unknown[])=>Promise<void>)(...args);}) as typeof rawSetDoc;
const updateDoc:typeof rawUpdateDoc=(async(...args:unknown[])=>{await reserveAccountReads(3,'manual');return (rawUpdateDoc as (...args:unknown[])=>Promise<void>)(...args);}) as typeof rawUpdateDoc;
const deleteDoc:typeof rawDeleteDoc=async(ref)=>{await reserveAccountReads(3,'manual');return rawDeleteDoc(ref);};
const getDocs:typeof rawGetDocs=(ref)=>readDocs(ref,20,'manual');
const getDoc:typeof rawGetDoc=async(ref)=>{await reserveAccountReads(3,'manual');return rawGetDoc(ref);};
const runTransaction:typeof rawRunTransaction=(database,update,options)=>rawRunTransaction(database,tx=>update(new Proxy(tx,{
 get(target,key){if(key==='get')return async(...args:Parameters<typeof tx.get>)=>{await reserveAccountReads(3,'manual');return target.get(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
})),options);

export const freeCollaborationEnabled = import.meta.env.VITE_FREE_COLLABORATION === 'true';
const localEmulators = import.meta.env.DEV && import.meta.env.VITE_FREE_EMULATORS === 'true';
const config = { projectId: 'cailloute-macavi', appId: '1:1049609361777:web:f46d20e961dee74b9bfed0', apiKey: 'AIzaSyDtF2Wu0BjTILQ8H_Sktwasr9fWqCdWxRw', authDomain: 'cailloute-macavi.firebaseapp.com' };
const app = freeCollaborationEnabled ? initializeApp(localEmulators ? { ...config, projectId: 'demo-cailloute-free' } : config, 'free-collaboration') : null;
const auth = app ? (Capacitor.isNativePlatform() ? initializeAuth(app, {persistence:indexedDBLocalPersistence}) : getAuth(app)) : null;
if (auth) auth.languageCode = 'fr';
const database = app ? getFirestore(app) : null;
if (localEmulators && auth && database) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(database, '127.0.0.1', 8189);
}
export interface FreeModerationDecision { id: string; action: "warning" | "suspend_7" | "suspend_30" | "ban" | "restore"; reason: string; until: number; decidedAt: number }
function timestampMillis(value:any):number{return value?.toMillis?.() ?? (typeof value?.seconds==='number'?value.seconds*1000+(value.nanoseconds||0)/1000000:0);}
function moderationDecision(value: any): FreeModerationDecision | undefined { return value ? {...value, until:timestampMillis(value.until), decidedAt:timestampMillis(value.decidedAt)} : undefined; }
function isMemberBlocked(member: any) { return member.blocked === true && !(timestampMillis(member.moderation?.until) > 0 && timestampMillis(member.moderation.until) <= Date.now()); }
export interface FreeSession { moderation?: FreeModerationDecision; uid: string; email: string; displayName: string; verified: boolean; isAdmin: boolean; termsAccepted: boolean; nicknameReserved?: boolean; blocked: boolean }
export interface FreeSharedPlace { id: string; place: Place | null; reviews: Review[]; deleted: boolean; updated: number; savedPhoto?: Photo; photoRevision?:string }
export interface FreeCursor { time: number; id: string; seconds?: number; nanoseconds?: number }
export interface FreeReport { id: string; uid: string; placeId: string; reviewId: string; photoId?: string; reason: string; status: string; created: number; placeSnapshot?: Place; photoSnapshot?: Photo; reviewSnapshot?: Review; resolution?: {photoUrl?:string;text?:string} }
export interface FreeContact { id: string; uid: string; message: string; created: number }
let session: FreeSession | null = null;
const listeners = new Set<(s: FreeSession | null) => void>();
function failure(code: string, message: string): never { throw Object.assign(new Error(message), { code: `free/${code}` }); }
function db() { if (!database) throw new Error('Partage gratuit désactivé.'); return database; }
function authentication() { if (!auth) throw new Error('Partage gratuit désactivé.'); return auth; }
function emit() { listeners.forEach(cb => cb(session)); }
const memberRequests=new Map<string,Promise<DocumentData>>();
let sessionGeneration=0;
async function publishSession(user: FirebaseUser | null,force=false) {
  const generation=++sessionGeneration;
  if(!user || user.isAnonymous){session=null;emit();return;}
  const next: FreeSession={uid:user.uid,email:user.email||'',displayName:'Contributeur',verified:user.emailVerified,isAdmin:await isFreeAdminIdentity(user,async()=>{await reserveReads(1,'manual');await rawGetDoc(doc(db(),'admin','access'));}),termsAccepted:false,blocked:false};
  try {
    const {db:local}=await import('./store');
    const key=`member-cache:${user.uid}`,cached=(await local.meta.get(key))?.value as {checked:number;data:DocumentData}|undefined;
    let data=cached?.data;
    if(force || next.isAdmin || !cached || Date.now()-cached.checked>=86400000){
      const load=async()=>{await reserveReads(3,next.isAdmin?'admin':force?'manual':'automatic');const member=await rawGetDoc(doc(db(),'members',user.uid));return member.data()||{};};
      let pending=memberRequests.get(user.uid);
      if(force || !pending){pending=load().finally(()=>memberRequests.delete(user.uid));memberRequests.set(user.uid,pending);}
      try{data=await pending;await local.meta.put({key,value:{checked:Date.now(),data}});}catch(error){if(!data)throw error;}
    }
    if(data){next.displayName=data.name||'Contributeur';next.nicknameReserved=!!data.nameKey;next.termsAccepted=data.terms===FREE_TERMS_VERSION;next.blocked=isMemberBlocked(data);next.moderation=moderationDecision(data.moderation);}
  }catch { /* Les contributions restent privées si le profil ne peut pas être vérifié. */ }
  // Publier un état complet ; une lecture ancienne ne doit pas écraser la session vérifiée.
  if(generation===sessionGeneration && auth?.currentUser?.uid===user.uid){session=next;emit();}
}
if (auth) onAuthStateChanged(auth, user => { void publishSession(user); });
export function getFreeSession() { return session?.blocked && session.moderation?.until && session.moderation.until <= Date.now() ? {...session,blocked:false} : session; }
// L'exemption est décidée à partir de l'identité Firebase vérifiée, jamais d'un réglage local.
export function freeReadMode(mode:ReadMode='automatic'):ReadMode {return getFreeSession()?.isAdmin ? 'admin' : mode;}
export function freeReadsLeft():Promise<number> {return automaticReadsLeft(freeReadMode());}
function reserveAccountReads(count:number,mode:ReadMode='automatic') {return reserveReads(count,freeReadMode(mode));}
export function watchFreePlace(id:string,changed:(value:FreeSharedPlace)=>void,failed:(error:unknown)=>void):()=>void {
 if(!getFreeSession()?.isAdmin)throw new Error('Accès administrateur nécessaire.');
 return onSnapshot(doc(db(),'shared',id),snapshot=>{
  if(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)return;
  void reserveAccountReads(3,'manual').catch(failed);
  if(snapshot.exists())changed(unpack(snapshot.id,snapshot.data()));
 },failed);
}
/** L'ouverture d'une fiche est une lecture explicite, indépendante du délai des zones. */
export async function fetchFreePlace(id:string):Promise<FreeSharedPlace|null> {
 const snapshot=await getDoc(doc(db(),'shared',id));
 return snapshot.exists()?unpack(snapshot.id,snapshot.data()):null;
}
export function subscribeFreeSession(cb: (s: FreeSession | null) => void) { listeners.add(cb); cb(session); return () => { listeners.delete(cb); }; }
export async function registerFreeAccount(email: string, password: string, displayName: string, acceptedTerms: boolean) {
  if (!acceptedTerms) throw new Error('Acceptez les CGU et confirmez votre majorité.');
  const {name} = nickname(displayName);
  const current=authentication().currentUser;
  const {user}=current && !current.isAnonymous && current.email===email.trim() && !getFreeSession()?.termsAccepted ? await signInWithEmailAndPassword(authentication(),email.trim(),password) : await createUserWithEmailAndPassword(authentication(),email.trim(),password);
  await acceptFreeTerms(name, acceptedTerms);
  await sendEmailVerification(user);
  await publishSession(user);
}
export async function acceptFreeTerms(displayName: string, acceptedTerms: boolean) {
 const user=authentication().currentUser;if(!user||user.isAnonymous)throw new Error('Connectez-vous pour choisir votre pseudo.');
 const {name,key}=nickname(displayName);
 await runTransaction(db(),async tx=>{
  const memberRef=doc(db(),'members',user.uid),nameRef=doc(db(),'usernames',key),budgetRef=doc(db(),'system','budget');
  const member=await tx.get(memberRef),reservation=await tx.get(nameRef);
  const old=member.data();
  if(!old?.adult && !acceptedTerms)throw new Error('Acceptez les conditions et confirmez votre majorité.');
  if(reservation.exists() && reservation.data().uid!==user.uid)throw new Error('Ce pseudo est déjà utilisé. Choisissez-en un autre.');
  const budget=member.exists()?null:(await tx.get(budgetRef)).data();
  if(!member.exists() && (!budget||budget.members>=FREE_STORAGE_LIMITS.members))failure('storage-full','Les inscriptions sont temporairement suspendues.');
  if(old?.nameKey && old.nameKey!==key)tx.delete(doc(db(),'usernames',old.nameKey));
  if(!reservation.exists())tx.set(nameRef,{uid:user.uid});
  if(member.exists()){if(old?.name!==name || old?.nameKey!==key || old?.terms!==FREE_TERMS_VERSION || !old?.adult)tx.update(memberRef,{name,nameKey:key,terms:FREE_TERMS_VERSION,adult:true});}
  else {tx.update(budgetRef,{members:budget!.members+1,lastType:'member',lastId:user.uid});tx.set(memberRef,{created:serverTimestamp(),name,nameKey:key,terms:FREE_TERMS_VERSION,adult:true,blocked:false,added:0,edited:0,deleted:0,day:Timestamp.fromMillis(0),dailyAdded:0,dailyEdited:0,dailyDeleted:0,recent:[],lastOp:'',lastPlace:''});}
 });
 await updateProfile(user,{displayName:name});await publishSession(user,true);
}
export async function loginFreeAccount(email: string, password: string) { const result = await signInWithEmailAndPassword(authentication(), email.trim(), password); await publishSession(result.user); }
export async function logoutFreeAccount() { await signOut(authentication()); }
export async function resetFreePassword(email: string) { await sendPasswordResetEmail(authentication(), email.trim()); }
let deletingAccount = false;
export function accountDeletionInProgress() { return deletingAccount; }
export async function requestFreeAccountDeletion() {
 if(deletingAccount)return;
 deletingAccount=true;
 try {
  const {waitForFavoriteSync}=await import("./store");
  const {waitForFreeSync}=await import("./free-sync");
  await Promise.all([waitForFavoriteSync(),waitForFreeSync()]);
  await deleteCurrentAccount();
 } finally {deletingAccount=false;}
}
async function deleteCurrentAccount() {
 const user=authentication().currentUser;
 if(!user || user.isAnonymous)throw new Error('Connectez-vous pour supprimer votre compte.');
 const token=await user.getIdTokenResult(true);
 if(Date.now()-Date.parse(token.authTime)>5*60*1000)throw new Error('Pour votre sécurité, déconnectez-vous puis reconnectez-vous avant de confirmer la suppression.');
 const uid=user.uid;
 // Le contenu collectif reste en place ; seul le nom affiché est anonymisé.
 let cursor:string|undefined;
 for(;;){
  const page: QuerySnapshot=await getDocs(query(collection(db(),'shared'),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),queryLimit(20)));
  for(const item of page.docs) if(item.data().reviews?.[uid]?.author !== undefined && item.data().reviews[uid].author !== 'Compte supprimé') {
   await runTransaction(db(),async tx=>{const latest=(await tx.get(item.ref)).data();if(latest?.reviews?.[uid])tx.update(item.ref,{reviews:{...latest.reviews,[uid]:{...latest.reviews[uid],author:'Compte supprimé'}},version:latest.version+1,place:latest.place?{...latest.place,version:latest.version+1}:null,updated:serverTimestamp()});});
  }
  if(page.size<20)break;cursor=page.docs.at(-1)!.id;
 }
 cursor=undefined;
 for(;;){
  const page: QuerySnapshot=await getDocs(query(collection(db(),'previews'),where('user_id','==',uid),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),queryLimit(20)));
  for(const item of page.docs) await updateDoc(item.ref,{author:'Compte supprimé'});
  if(page.size<20)break;cursor=page.docs.at(-1)!.id;
 }
 // Les messages privés et signalements du compte ne sont pas des contributions publiques.
 await deleteDoc(doc(db(),'contacts',uid));
 for(;;){const page: QuerySnapshot=await getDocs(query(collection(db(),'reports'),where('uid','==',uid),queryLimit(20)));if(page.empty)break;for(const item of page.docs)await deleteDoc(item.ref);}
 await deleteDoc(doc(db(),'members',uid,'badges','helpful'));
 for(;;){const page: QuerySnapshot=await getDocs(query(collection(db(),'members',uid,'favorites'),queryLimit(20)));if(page.empty)break;for(const item of page.docs)await deleteDoc(item.ref);}
 await runTransaction(db(),async tx=>{const memberRef=doc(db(),'members',uid),budgetRef=doc(db(),'system','budget');const member=await tx.get(memberRef),budget=await tx.get(budgetRef);if(member.exists()){if(member.data().nameKey)tx.delete(doc(db(),'usernames',member.data().nameKey));tx.delete(memberRef);tx.update(budgetRef,{members:budget.data()!.members-1,lastType:'member-delete',lastId:uid});}});
 if(Capacitor.isNativePlatform()){
  const {Filesystem,Directory}=await import('@capacitor/filesystem');
  await Filesystem.deleteFile({path:`avatars/${encodeURIComponent(`profile-avatar:${uid}`)}.txt`,directory:Directory.Data}).catch(()=>{});
 }
 await deleteUser(user);
 const {db:local}=await import('./store');
 await local.transaction('rw',local.meta,local.favorites,local.freeQueue,local.details,local.personal,async()=>{
  if((await local.meta.get('favorite-owner'))?.value===uid){await local.favorites.clear();await local.meta.put({key:'favorite-owner',value:''});}
  for(const detail of await local.details.toArray()){
   if(detail.reviews.some(r=>r.user_id===uid)||detail.photos.some(p=>p.user_id===uid))await local.details.put({...detail,reviews:detail.reviews.map(r=>r.user_id===uid?{...r,author:'Compte supprimé'}:r),photos:detail.photos.map(p=>p.user_id===uid?{...p,author:'Compte supprimé'}:p)});
  }
  for(const item of await local.personal.toArray()){
   if(item.review?.user_id===uid || item.photos.some(p=>p.user_id===uid))await local.personal.put({...item,review:item.review?.user_id===uid?{...item.review,author:'Compte supprimé'}:item.review,photos:item.photos.map(p=>p.user_id===uid?{...p,author:'Compte supprimé'}:p)});
  }
  await local.meta.bulkDelete([`profile-avatar:${uid}`,`favorite-cache:${uid}`,`favorite-pending:${uid}`,`contribution-stats:${uid}`,`helpful-badge:${uid}`]);
  const pending=await local.freeQueue.toArray();for(const item of pending)if(item.owner===uid)await local.freeQueue.delete(item.id);
 });
 session=null;emit();
}

export async function resendFreeVerification() { const user = authentication().currentUser; if (user) await sendEmailVerification(user); }
export async function reloadFreeSession() { const user = authentication().currentUser; if (user) { await reload(user); await user.getIdToken(true); } await publishSession(user,true); }
function contributor() { if(deletingAccount)throw new Error('Suppression du compte en cours.'); const user = authentication().currentUser; if (!user?.emailVerified) failure('unverified', 'Vérifiez votre adresse e-mail avant de contribuer.'); return user; }
const fields = ['name','category','lat','lon','address','city','hours','description','website','activity_type','health_type','pediatric','baby_food','organic','toilet_public','children_clothes','shop_type','information_validated','validated_at','validation_changed_at','age','access','transit_modes','transit_lines','toilets_available','wheelchair','changing_table','drinking_water','free','fenced','elevator','shade','shelter','bench','condition','condition_observed_at'] as const;
function compactPlace(id: string, raw: Partial<Place>, version: number): Place {
  const result: Record<string, unknown> = { id, version, name: '', category: 'other', lat: 0, lon: 0, address: '', city: '', hours: '', description: '', age: '', access: '', wheelchair: null, changing_table: null, drinking_water: null, free: null, fenced: null, elevator: null, sources: [], rating: null, review_count: 0, community: true, photo_count: 0 };
  for (const field of fields) if (raw[field] !== undefined) result[field] = raw[field];
  const textLimits: Record<string, number> = { name:160,address:300,city:100,hours:500,description:2000,age:100,access:300,website:300,activity_type:100,shop_type:100,validated_at:40,validation_changed_at:40,condition:100,condition_observed_at:40 };
  for (const [key, max] of Object.entries(textLimits)) if (key in result) result[key] = String(result[key] ?? '').slice(0, max);
  if (result.website && !/^https?:\/\//i.test(String(result.website))) result.website = `https://${result.website}`;
  result.transit_lines = Array.isArray(raw.transit_lines) ? raw.transit_lines.slice(0, 80).map(v => String(v).slice(0, 20)) : [];
  return result as unknown as Place;
}
// Préserver intégralement les valeurs déjà enregistrées et normaliser seulement la correction.
function patchRecordedPlace(existing: Place, patch: Partial<Place>, version: number): Place {
 const normalized=compactPlace(existing.id,{...existing,...patch},version);
 const changed=Object.fromEntries(Object.keys(patch).filter(key=>(fields as readonly string[]).includes(key)).map(key=>[key,normalized[key as keyof Place]]));
 return {...existing,...changed,version};
}
function unpack(id: string, value: Record<string, any>): FreeSharedPlace {
  const reviews = Object.values(value.reviews || {}) as Review[];
  const place = value.deleted ? null : value.place as Place;
  if (place) { place.rating = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : null; place.review_count = reviews.length; }
  return { id, place, reviews, ...((['photo.add','photo.delete'].includes(value.kind) || (value.moderationReport && value.lastPhoto))?{photoRevision:`${value.version}:${value.lastModeration||''}:${value.lastPhoto||''}`}:{ }), deleted: value.deleted === true, updated: value.updated instanceof Timestamp ? value.updated.toMillis() : 0 };
}
/** Chaque opération et son compteur sont validés atomiquement par les règles serveur. */
export async function pushFreeOperation(op: Op, base?: Place): Promise<FreeSharedPlace> {
  const user = contributor();
  const supported = ['place.create','place.edit','place.delete','place.validate','review.save','review.delete','photo.add','photo.delete'];
  if (!supported.includes(op.kind)) throw new Error('Cette donnée reste uniquement sur cet appareil.');
  const ref = doc(db(), 'shared', op.place_id), memberRef = doc(db(), 'members', user.uid);
  return runTransaction(db(), async tx => {
    const [snapshot, profile] = await Promise.all([tx.get(ref), tx.get(memberRef)]);
    if (!profile.exists()) throw new Error('Acceptez les CGU dans Profil pour terminer votre inscription.');
    const member = profile.data(), existing = snapshot.data();
    const budgetRef = doc(db(), 'system', 'budget');
    const budgetSnap = await tx.get(budgetRef); const budget = budgetSnap.data();
    if (!budget || (!existing && budget.places >= FREE_STORAGE_LIMITS.places)) failure('storage-full', 'Le stockage partagé est plein. Votre contribution reste locale.');
    const photoId = op.kind === 'photo.add' ? `${op.place_id}_${op.id}` : op.kind === 'photo.delete' ? String(op.payload.id || op.payload.photo_id || '') : '';
    const previewRefs = photoId ? [doc(db(), 'previews', photoId)] : [];
    const previewSnaps = await Promise.all(previewRefs.map(r => tx.get(r)));
    let previewDelta = 0; let savedPhoto: Photo | undefined;
    if (isMemberBlocked(member)) failure('blocked', 'Vos contributions sont suspendues.');
    if (member.recent.includes(op.id)) {
      if (!existing) throw new Error('Cette opération a déjà été traitée.');
      const existingPreview = previewSnaps.find(p => p.exists() && p.data()?.lastOp === op.id);
      return { ...unpack(op.place_id, existing), ...(existingPreview ? { savedPhoto: { ...existingPreview.data(), id: existingPreview.id, created: existingPreview.data()!.created.toDate().toISOString() } as Photo } : {}) };
    }
    const version = existing?.version || 0;
    if (existing?.deleted) failure('conflict', 'Ce lieu a été supprimé définitivement.');
    if (op.base_version !== undefined && op.base_version !== (existing?.version ?? 0)) failure('conflict', 'Ce lieu a changé. Rechargez sa fiche avant de modifier.');
    const category = op.kind === 'place.create' ? 'added' : op.kind === 'place.delete' ? 'deleted' : 'edited';
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const sameDay = member.day instanceof Timestamp && member.day.toMillis() === day.getTime();
    const daily = { dailyAdded: sameDay ? member.dailyAdded : 0, dailyEdited: sameDay ? member.dailyEdited : 0, dailyDeleted: sameDay ? member.dailyDeleted : 0 };
    const key = category === 'added' ? 'dailyAdded' : category === 'deleted' ? 'dailyDeleted' : 'dailyEdited';
    if (!session?.isAdmin && daily[key] >= FREE_LIMITS[category]) failure('daily-quota', 'Limite quotidienne atteinte. Votre contribution reste sur cet appareil.');
    daily[key]++;
    const patch = op.kind.startsWith('place.') && !['place.delete','place.validate'].includes(op.kind) ? op.payload : {};
    const place = existing?.place ? patchRecordedPlace(existing.place,patch,version+1) : compactPlace(op.place_id,{...base,...patch},version+1);
    if (existing && op.kind !== 'place.delete' && sharedCell(place) !== existing.cell) failure('conflict', 'Ce déplacement change de secteur. Pour cette version, contactez l’éditeur ; la correction reste sur cet appareil.');
    if (op.kind === 'place.validate') {
      place.information_validated = op.payload.value === true;
      place.validation_changed_at = new Date().toISOString();
      if (place.information_validated) place.validated_at = place.validation_changed_at;
    }
    if (!place.name || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) throw new Error('Nom et position du lieu nécessaires.');
    const reviews = { ...(existing?.reviews || {}) };
    if (op.kind === 'review.save') {
      const text = String(op.payload.text || '').trim(), stars = Number(op.payload.stars);
      if (text.length > 1000 || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error('Avis invalide : note de 1 à 5 et texte de 1 000 caractères maximum.');
      if (!reviews[user.uid] && Object.keys(reviews).length >= 20) throw new Error('Ce lieu a atteint la limite de 20 avis.');
      const now = new Date().toISOString();
      reviews[user.uid] = { id: user.uid, user_id: user.uid, author: member.name, place_id: op.place_id, stars, text, created: reviews[user.uid]?.created || now, updated: now, votes: reviews[user.uid]?.votes || 0, voters: reviews[user.uid]?.voters || [], downvotes: reviews[user.uid]?.downvotes || 0, downvoters: reviews[user.uid]?.downvoters || [] };
    }
    if (op.kind === 'review.delete') {
      if (op.payload.id && op.payload.id !== user.uid) throw new Error('Signalez cet avis pour demander sa modération.');
      delete reviews[user.uid];
    }
    if (op.kind === 'photo.add') {
      if (op.payload.privacy_reviewed !== true || op.payload.rights_accepted !== true) failure('invalid-preview', 'Vérifiez le floutage et les droits de cette photo avant le partage.');
      const available = 0;
      if (previewSnaps[0].exists()) failure('conflict', 'Cette photo existe déjà.');
      if (budget.previews >= FREE_STORAGE_LIMITS.previews) failure('storage-full', 'Le stockage des aperçus est plein. Votre photo reste locale.');
      const image = String(op.payload.base64 || '');
      if (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 53359) failure('invalid-preview', 'Aperçu trop volumineux : 40 Ko maximum.');
      tx.set(previewRefs[available], { placeId: op.place_id, user_id: user.uid, author: member.name, url: image, caption: String(op.payload.caption || '').slice(0, 160), privacy_reviewed: true, rights_accepted: true, created: serverTimestamp(), lastOp: op.id });
      savedPhoto = {id: previewRefs[available].id, place_id: op.place_id, user_id: user.uid, author: member.name, url: image, caption: String(op.payload.caption || '').slice(0, 160), created: new Date().toISOString()};
      previewDelta = 1;
    }
    if (op.kind === 'photo.delete') {
      const id = String(op.payload.id || op.payload.photo_id || ''); const i = previewRefs.findIndex(r => r.id === id);
      if (i < 0 || !previewSnaps[i].exists() || previewSnaps[i].data()?.placeId !== op.place_id) failure('conflict', 'Cet aperçu a déjà été supprimé.');
      tx.delete(previewRefs[i]); previewDelta = -1;
    }
    const deleted = op.kind === 'place.delete';
    // La fiche supprimée rend ses photos inaccessibles, sans transaction de taille limitée.
    place.photo_count = Math.max(0, (existing?.place?.photo_count || 0) + previewDelta);
    if (!existing || previewDelta) tx.update(budgetRef, { places: budget.places + (existing ? 0 : 1), previews: budget.previews + previewDelta, lastType: 'shared', lastId: op.place_id });
    const next = { place: deleted ? null : place, reviews: deleted ? {} : reviews, deleted, updated: serverTimestamp(), version: version + 1, cell: existing?.cell || sharedCell(place), lastOp: op.id, by: user.uid, kind: op.kind, lastPhoto: photoId };
    tx.set(ref, next);
    tx.update(memberRef, { ...daily, day: Timestamp.fromDate(day), [category]: member[category] + 1, recent: [...member.recent, op.id].slice(-64), lastOp: op.id, lastPlace: op.place_id });
    return { ...unpack(op.place_id, { ...next, updated: Timestamp.now() }), ...(savedPhoto ? { savedPhoto } : {}) };
  });
}
// Écoute bornée : la première nouveauté réveille la récupération paginée existante.
export function watchFreeChanges(cell: string, cursor: FreeCursor | null, changed: () => void, failed: (error: unknown) => void): () => void {
  const constraints: QueryConstraint[] = [where('cell', 'in', [cell]), orderBy('updated'), orderBy(documentId())];
  if (cursor) constraints.push(startAfter(cursor.seconds !== undefined ? new Timestamp(cursor.seconds, cursor.nanoseconds || 0) : Timestamp.fromMillis(cursor.time), cursor.id));
  return onSnapshot(query(collection(db(), 'shared'), ...constraints, queryLimit(1)), {includeMetadataChanges:true}, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && !snapshot.empty) changed();
  }, failed);
}
export async function fetchFreeChanges(cells: string[], cursor: FreeCursor | null, pageSize: number): Promise<{ changes: FreeSharedPlace[]; cursor: FreeCursor | null; hasMore: boolean }> {
  const n = Math.max(1, Math.min(FREE_PAGE_SIZE, Math.floor(pageSize)));
  if (!cells.length) return { changes: [], cursor, hasMore: false };
  const constraints: QueryConstraint[] = [where('cell', 'in', [...new Set(cells)].slice(0, 9)), orderBy('updated'), orderBy(documentId())];
  if (cursor) constraints.push(startAfter(cursor.seconds !== undefined ? new Timestamp(cursor.seconds, cursor.nanoseconds || 0) : Timestamp.fromMillis(cursor.time), cursor.id));
  const snapshot = await readDocs(query(collection(db(), 'shared'), ...constraints, queryLimit(n)),n,'automatic');
  const changes = snapshot.docs.map(s => unpack(s.id, s.data()));
  const last = changes.at(-1);
  return { changes, cursor: last ? { time: last.updated, id: last.id, seconds: snapshot.docs.at(-1)!.data().updated.seconds, nanoseconds: snapshot.docs.at(-1)!.data().updated.nanoseconds } : cursor, hasMore: changes.length === n };
}
export async function reportFreeReview(placeId: string, reviewId: string, reason: string, photoId = '', context?: {place:Place;photo?:Photo;review?:Review}) {
  let user = authentication().currentUser;
  if(!user) user=(await signInAnonymously(authentication())).user;
  if (!reason.trim() || reason.length > 1000) throw new Error('Indiquez un motif de 1 à 1 000 caractères.');
  const target = `${placeId}\0${reviewId}\0${photoId}`;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(target))),value=>value.toString(16).padStart(2,"0")).join("").slice(0,24);
  const ref = doc(db(), "reports", `${user.uid}_${hash}`);
  return runTransaction(db(), async tx => {
    const previous = await tx.get(ref);
    if (previous.exists() && previous.data().status === "pending") return false;
    const fallback=context?{placeSnapshot:compactPlace(placeId,{...context.place,photo_count:0},0),
      ...(context.photo?{photoSnapshot:{id:photoId,place_id:placeId,user_id:context.photo.user_id,author:context.photo.author||'Contributeur',url:context.photo.url,caption:context.photo.caption||'',created:context.photo.created}}:{}),
      ...(context.review?{reviewSnapshot:{id:reviewId,place_id:placeId,user_id:context.review.user_id,author:context.review.author,stars:context.review.stars,text:context.review.text,created:context.review.created,updated:context.review.updated,votes:0,voters:[]}}:{})}:{};
    tx.set(ref, { ...fallback,uid: user.uid, placeId, reviewId, ...(photoId ? {photoId} : {}), reason: reason.trim(), status: "pending", created: serverTimestamp() });
    return true;
  });
}
export async function sendFreeContact(message: string) {
  const user = contributor();
  if (!message.trim() || message.length > 2000) throw new Error('Message de 1 à 2 000 caractères nécessaire.');
  // Un message par compte et par jour : boîte privée, sans prestataire e-mail.
  await setDoc(doc(db(), 'contacts', user.uid), { uid: user.uid, message: message.trim(), created: serverTimestamp() });
}
export async function listFreeReports(): Promise<FreeReport[]> { const s = await getDocs(query(collection(db(), 'reports'), where('status', '==', 'pending'), queryLimit(20))); return s.docs.map(d => ({ ...d.data(), id: d.id, created: d.data().created.toMillis() } as FreeReport)); }
export async function listFreeContacts(): Promise<FreeContact[]> { const s = await getDocs(query(collection(db(), 'contacts'), orderBy('created', 'desc'), queryLimit(20))); return s.docs.map(d => ({ ...d.data(), id: d.id, created: d.data().created.toMillis() } as FreeContact)); }
export function watchFreeModeration(reports:(rows:FreeReport[])=>void,contacts:(rows:FreeContact[])=>void,failed:(error:unknown)=>void):()=>void{
 const watch=(ref:Query,receive:(snapshot:QuerySnapshot)=>void)=>onSnapshot(ref,snapshot=>{
  if(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)return;
  void reserveAccountReads(Math.max(1,snapshot.docChanges().length)+2,'manual').catch(failed);receive(snapshot);
 },failed);
 const stopReports=watch(query(collection(db(),'reports'),where('status','==','pending'),queryLimit(20)),s=>reports(s.docs.map(d=>({...d.data(),id:d.id,created:d.data().created.toMillis()} as FreeReport))));
 const stopContacts=watch(query(collection(db(),'contacts'),orderBy('created','desc'),queryLimit(20)),s=>contacts(s.docs.map(d=>({...d.data(),id:d.id,created:d.data().created.toMillis()} as FreeContact))));
 return ()=>{stopReports();stopContacts();};
}
export async function deleteFreeContact(contact: FreeContact) {
  if (!getFreeSession()?.isAdmin) throw new Error("Action réservée à l’administrateur.");
  await runTransaction(db(),async tx=>{
    const ref=doc(db(),"contacts",contact.id),current=await tx.get(ref);
    if (!current.exists()) return;
    if (current.data().created.toMillis() !== contact.created) throw new Error("Le message a changé. Actualisez avant de le supprimer.");
    tx.delete(ref);
  });
}
export async function resolveFreeReport(reportId: string, remove: boolean, expectedReview?: Review) {
  if (!getFreeSession()?.isAdmin) throw new Error("Action réservée à l’administrateur.");
  const change = await runTransaction(db(), async tx => {
    const reportRef = doc(db(), 'reports', reportId), reportSnap = await tx.get(reportRef);
    if (!reportSnap.exists()) throw new Error('Signalement introuvable.');
    const report = reportSnap.data();
    if (report.status !== 'pending') throw new Error('Ce signalement a déjà été traité.');
    let changed: FreeSharedPlace | undefined;
    if (remove) {
      if (!report.reviewId) throw new Error("Ce signalement ne concerne pas un avis.");
      const placeRef = doc(db(), 'shared', report.placeId), place = await tx.get(placeRef);
      if (place.exists() && !place.data().deleted) {
        const data = place.data(), reviews = { ...data.reviews };
        const current = reviews[report.reviewId];
        if (current) {
          if (!expectedReview || current.updated !== expectedReview.updated || current.text !== expectedReview.text || current.stars !== expectedReview.stars) throw new Error('L’avis a changé. Relisez-le avant de décider.');
          delete reviews[report.reviewId];
          const next = { place: { ...data.place, version: data.version + 1 }, reviews, updated: serverTimestamp(), version: data.version + 1 };
          tx.update(placeRef, next);
          changed = unpack(report.placeId, {...data,...next,updated:Timestamp.now()});
        } else changed = unpack(report.placeId,data);
      }
    }
    tx.update(reportRef, { status: remove ? 'removed' : 'dismissed' });
    return changed;
  });
  if (change) {
    const { applyFreeChanges } = await import("./free-sync");
    await applyFreeChanges([change]);
    const { db: local, notify } = await import("./store");
    // Une copie personnelle identique ne doit pas réafficher l’avis modéré.
    if (expectedReview) await local.personal.toCollection().modify(row => {
      const review=row.review;
      if(review?.id===expectedReview.id && review.place_id===expectedReview.place_id && review.updated===expectedReview.updated && review.text===expectedReview.text) delete row.review;
    });
    notify();
  }
}


export type ReportAction = 'remove' | 'edit';
export async function moderateFreeReport(reportId: string, action: ReportAction, expected: FreeSharedPlace, patch: {text?:string;photoUrl?:string;caption?:string;place?:Partial<Place>} = {}) {
 if(!getFreeSession()?.isAdmin)throw new Error('Action réservée à l’administrateur.');
 const result=await runTransaction(db(),async tx=>{
  const reportRef=doc(db(),'reports',reportId),reportSnap=await tx.get(reportRef);
  if(!reportSnap.exists() || reportSnap.data().status!=='pending')throw new Error('Ce signalement a déjà été traité.');
  const report=reportSnap.data(),placeRef=doc(db(),'shared',report.placeId),snapshot=await tx.get(placeRef);
  let data=snapshot.data();
  const photoRef=report.photoId?doc(db(),'previews',report.photoId):null;
  const photoSnap=photoRef?await tx.get(photoRef):null;
  const privateTarget=(report.photoId && !photoSnap?.exists()) || (report.reviewId && !data?.reviews?.[report.reviewId]);
  if(privateTarget){
    const old=report.photoId?report.photoSnapshot:report.reviewSnapshot;
    const shown=report.photoId?expected.savedPhoto:expected.reviews.find(r=>r.id===report.reviewId);
    if(!old || !shown || (report.photoId ? old.url!==(shown as Photo).url : old.text!==(shown as Review).text))throw new Error('Le contenu a changé. Actualisez avant de décider.');
    const resolution=action==='remove'?{}:report.photoId?{photoUrl:patch.photoUrl||old.url}:{text:(patch.text||'').trim()};
    if('photoUrl' in resolution && (!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(resolution.photoUrl!) || resolution.photoUrl!.length>53359))throw new Error('Photo WebP de 40 Ko maximum.');
    if('text' in resolution && (!resolution.text || resolution.text.length>1000))throw new Error('Texte requis, 1 000 caractères maximum.');
    tx.update(reportRef,{status:action==='remove'?'removed':'corrected',resolution});
    return {...expected,privateTarget:true,report:{...report,id:reportId,status:action==='remove'?'removed':'corrected',resolution} as FreeReport,reviews:report.reviewId?expected.reviews.flatMap(r=>r.id!==report.reviewId?[r]:action==='remove'?[]:[{...r,text:resolution.text!,updated:new Date().toISOString()}]):expected.reviews,...(report.photoId && action==='edit'?{savedPhoto:{...expected.savedPhoto!,url:resolution.photoUrl!}}:{})};
  }
  if(!data){
    if(!report.placeSnapshot || report.reviewId || report.photoId || !expected.place || expected.place.version!==0)throw new Error('Le contenu a changé. Actualisez avant de décider.');
    const budgetRef=doc(db(),'system','budget'),budget=(await tx.get(budgetRef)).data();
    if(!budget || budget.places>=FREE_STORAGE_LIMITS.places)throw new Error('Limite des corrections partagées atteinte.');
    const place=action==='remove'?null:compactPlace(report.placeId,{...report.placeSnapshot,...patch.place,photo_count:0},1);
    data={place,reviews:{},deleted:action==='remove',version:1,cell:sharedCell(report.placeSnapshot),lastOp:crypto.randomUUID(),by:authentication().currentUser!.uid,kind:'moderation',lastPhoto:'',updated:serverTimestamp(),moderationReport:reportId,lastModeration:crypto.randomUUID()};
    if(place && sharedCell(place)!==data.cell)throw new Error('Conservez le lieu dans son secteur actuel.');
    tx.set(placeRef,data);tx.update(budgetRef,{places:budget.places+1,lastType:'moderation-place',lastId:report.placeId});tx.update(reportRef,{status:action==='remove'?'removed':'corrected'});
    return unpack(report.placeId,{...data,updated:Timestamp.now()});
  }
  if(data.deleted || !expected.place || expected.id!==report.placeId || data.version!==expected.place.version)throw new Error('Le contenu a changé. Actualisez et relisez-le avant de décider.');
  const budgetRef=doc(db(),'system','budget'),budget=photoRef&&action==='remove'?(await tx.get(budgetRef)).data():null;
  const reviews={...data.reviews},version=data.version+1;
  const next:Record<string,any>={place:{...data.place,version},reviews,version,updated:serverTimestamp(),lastModeration:crypto.randomUUID(),moderationReport:reportId};
  let savedPhoto:Photo|undefined;
  if(report.photoId){
   const photo=photoSnap?.data();if(!photo || photo.placeId!==report.placeId || photo.url!==expected.savedPhoto?.url || photo.caption!==expected.savedPhoto?.caption)throw new Error('La photo a changé ou a déjà été supprimée.');
   next.lastPhoto=report.photoId;
   if(action==='remove'){
    if(!budget || budget.previews<1)throw new Error('Compteur de photos indisponible.');
    tx.delete(photoRef!);next.place.photo_count=Math.max(0,data.place.photo_count-1);
    tx.update(budgetRef,{previews:budget.previews-1,lastType:'moderation',lastId:report.photoId});
   }else{
    const url=patch.photoUrl||photo.url,caption=(patch.caption??photo.caption).trim();
    if(!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(url)||url.length>53359||caption.length>160)throw new Error('Photo WebP de 40 Ko maximum et légende de 160 caractères maximum.');
    tx.update(photoRef!,{url,caption});savedPhoto={...expected.savedPhoto!,url,caption};
   }
  }else if(report.reviewId){
   const current=reviews[report.reviewId],old=expected.reviews.find(r=>r.id===report.reviewId);
   if(!current || !old || current.updated!==old.updated || current.text!==old.text)throw new Error('L’avis a changé ou a déjà été supprimé.');
   if(action==='remove')delete reviews[report.reviewId];
   else{const text=(patch.text??'').trim();if(!text || text.length>1000)throw new Error('Texte requis, 1 000 caractères maximum.');reviews[report.reviewId]={...current,text,updated:new Date().toISOString()};}
  }else if(action==='remove'){next.deleted=true;next.place=null;next.reviews={};}
  else{
   next.place=patchRecordedPlace(data.place,patch.place||{},version);
   if(sharedCell(next.place)!==data.cell)throw new Error('Conservez le lieu dans son secteur actuel.');
  }
  tx.update(placeRef,next);tx.update(reportRef,{status:action==='remove'?'removed':'corrected'});
  return {...unpack(report.placeId,{...data,...next,updated:Timestamp.now()}),...(savedPhoto?{savedPhoto}:{})};
 });
 if('privateTarget' in result){await applyPrivateReportDecision(result.report);return;}
 const {applyFreeChanges}=await import('./free-sync');await applyFreeChanges([result]);
 const {db:local,notify}=await import('./store');
 const link=await local.catalogSources.get(expected.id),canonicalId=link?.canonicalId || expected.id;
 const aliases=await local.catalogSources.where('canonicalId').equals(canonicalId).primaryKeys();
 const ids=[...new Set([expected.id,canonicalId,...aliases])];
 const reportPhoto=expected.savedPhoto;
 if(reportPhoto){
  await local.details.where('id').anyOf(ids).modify(row=>{row.photos=row.photos.flatMap(p=>p.id!==reportPhoto.id?[p]:action==='remove'?[]:[{...p,...result.savedPhoto}]);row.photo_count=row.photos.length;});
  await local.personal.where('id').anyOf(ids).modify(row=>{row.photos=row.photos.flatMap(p=>p.id!==reportPhoto.id?[p]:action==='remove'?[]:[{...p,...result.savedPhoto}]);});
 }
 await local.personal.where('id').anyOf(ids).modify(row=>{if(row.review){const old=expected.reviews.find(r=>r.id===row.review!.id && r.place_id===row.review!.place_id);if(old && old.text===row.review.text){const updated=result.reviews.find(r=>r.id===old.id);if(updated)row.review=updated;else delete row.review;}}});
 if('privateTarget' in result && !reportPhoto)await local.details.where('id').anyOf(ids).modify(row=>{row.reviews=row.reviews.flatMap(r=>{const before=expected.reviews.find(v=>v.id===r.id);if(!before || before.text!==r.text)return [r];return result.reviews.filter(v=>v.id===r.id);});});

 await local.meta.delete(`free-previews:${expected.id}`);notify();
}

async function applyPrivateReportDecision(report:FreeReport){
 const {db:local,notify}=await import('./store');
 const link=await local.catalogSources.get(report.placeId),canonical=link?.canonicalId||report.placeId;
 const aliases=await local.catalogSources.where('canonicalId').equals(canonical).primaryKeys(),ids=[...new Set([report.placeId,canonical,...aliases])];
 const photo=report.photoSnapshot,review=report.reviewSnapshot;
 const photos=(rows:Photo[])=>rows.flatMap(p=>!photo || p.id!==photo.id || p.url!==photo.url?[p]:report.status==='removed'?[]:[{...p,url:report.resolution?.photoUrl||p.url}]);
 const reviews=(rows:Review[])=>rows.flatMap(r=>!review || r.id!==review.id || r.text!==review.text || r.updated!==review.updated?[r]:report.status==='removed'?[]:[{...r,text:report.resolution?.text||r.text}]);
 await local.transaction('rw',local.details,local.personal,local.freeQueue,local.meta,async()=>{
  await local.details.where('id').anyOf(ids).modify(row=>{row.photos=photos(row.photos);row.reviews=reviews(row.reviews);row.photo_count=row.photos.length;});
  await local.personal.where('id').anyOf(ids).modify(row=>{row.photos=photos(row.photos);if(row.review){const result=reviews([row.review]);if(result.length)row.review=result[0];else delete row.review;}});
  // Empêcher une contribution en attente de republier le contenu qui vient d’être modéré.
  for(const q of await local.freeQueue.toArray()){
   if(!ids.includes(q.operation.place_id))continue;
   const op=q.operation;
   if(photo && op.kind==='photo.add' && q.id===photo.id){if(report.status==='removed')await local.freeQueue.delete(q.id);else await local.freeQueue.put({...q,operation:{...op,payload:{...op.payload,base64:report.resolution!.photoUrl!.split(',')[1]}}});}
   if(review && op.kind==='review.save' && op.payload.text===review.text && q.owner===review.user_id){if(report.status==='removed')await local.freeQueue.delete(q.id);else await local.freeQueue.put({...q,operation:{...op,payload:{...op.payload,text:report.resolution!.text}}});}
  }
  await local.meta.put({key:`private-report:${report.id}`,value:JSON.stringify([report.status,report.resolution])});
 });notify();
}
export async function syncFreePrivateDecisions(readLimit=10):Promise<number>{
 const user=authentication().currentUser;if(!user || user.isAnonymous || readLimit<2)return 0;
 const {db:local}=await import('./store');let reads=0;
 for(const type of ['photoSnapshot','reviewSnapshot']){
  const size=Math.min(5,Math.floor(readLimit/2)),key=`private-report-cursor:${user.uid}:${type}`;
  const state=(await local.meta.get(key))?.value as {day:number;id?:string}|undefined,day=Math.floor(Date.now()/86400000),cursor=state?.day===day?state.id:undefined;
  const page=await readDocs(query(collection(db(),'reports'),where(`${type}.user_id`,'==',user.uid),where('status','in',['removed','corrected']),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),queryLimit(size)),size,'automatic');reads+=Math.max(1,page.size);
  for(const item of page.docs){const report={...item.data(),id:item.id} as FreeReport;if(!report.resolution)continue;const marker=JSON.stringify([report.status,report.resolution]);if((await local.meta.get(`private-report:${item.id}`))?.value!==marker)await applyPrivateReportDecision(report);}
  await local.meta.put({key,value:{day,...(page.size===size?{id:page.docs.at(-1)!.id}:{})}});
 }return reads;
}

export interface PreviewCursor {source:number;after?:string}
export interface PreviewPage {photos:Photo[];cursor:PreviewCursor;hasMore:boolean}
export async function fetchFreePreviewPage(sourceIds:string[],cursor:PreviewCursor={source:0},mode:ReadMode='automatic'):Promise<PreviewPage>{
 const ids=[...new Set(sourceIds)],photos:Photo[]=[];let next={...cursor};
 while(next.source<ids.length && photos.length<3){
  const id=ids[next.source],size=3-photos.length;
  try{
   if(mode==='automatic' && await freeReadsLeft()<size+2){if(photos.length)break;await reserveAccountReads(size+2,mode);}
   const page=await readDocs(query(collection(db(),'previews'),where('placeId','==',id),orderBy(documentId()),...(next.after?[startAfter(next.after)]:[]),queryLimit(size)),size,mode);
   photos.push(...page.docs.map(d=>({...d.data(),id:d.id,place_id:id,created:d.data().created.toDate().toISOString()} as Photo)));
   if(page.size===size)next={source:next.source,after:page.docs.at(-1)!.id};
   else next={source:next.source+1};
  }catch(error){if((error as {code?:string}).code!=='permission-denied')throw error;next={source:next.source+1};}
 }
 return {photos,cursor:next,hasMore:next.source<ids.length};
}
/** Compatibilité des anciens appels : un seul lot de trois. */
export async function fetchFreePreviews(placeId:string,sourceIds:string[]=[placeId]):Promise<Photo[]>{return (await fetchFreePreviewPage(sourceIds)).photos;}
export async function listFreeBlockedMembers(): Promise<{uid: string; name: string}[]> {
  const members: {uid:string;name:string}[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await getDocs(query(collection(db(), 'members'), where('blocked', '==', true), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), queryLimit(20)));
    members.push(...page.docs.filter(d => isMemberBlocked(d.data())).map(d => ({uid:d.id,name:d.data().name})));
    if(page.size < 20) return members;
    cursor = page.docs.at(-1)!.id;
  }
}
export async function getFreeUsage(): Promise<{members: number; places: number; previews: number}> {
  const d = await getDoc(doc(db(), 'system', 'budget')); if (!d.exists()) throw new Error('Statistiques indisponibles.');
  const {members,places,previews}=d.data(); return {members,places,previews};
}

export async function getFreeReportedPlace(placeId: string, photoId?: string, report?:FreeReport): Promise<FreeSharedPlace | null> {
 const snapshot=await getDoc(doc(db(),'shared',placeId));
 const value:FreeSharedPlace=snapshot.exists()?unpack(snapshot.id,snapshot.data()):{id:placeId,place:report?.placeSnapshot||null,reviews:[],deleted:false,updated:0};
 if(!value.place)return null;
 if(report?.reviewSnapshot && !value.reviews.some(r=>r.id===report.reviewId))value.reviews.push(report.reviewSnapshot);
 if(photoId && !value.deleted){const photo=await getDoc(doc(db(),'previews',photoId));if(photo.exists()&&photo.data().placeId===placeId)value.savedPhoto={...photo.data(),id:photoId,place_id:placeId,created:photo.data().created instanceof Timestamp?photo.data().created.toDate().toISOString():String(photo.data().created||'')} as Photo;else if(report?.photoSnapshot)value.savedPhoto=report.photoSnapshot;}
 return value;
}

export async function loginFreeGoogle() {
  try {
    if (Capacitor.isNativePlatform()) {
      const result=await nativeGoogleLogin(options=>FirebaseAuthentication.signInWithGoogle(options));
      if(!result.credential?.idToken) throw new Error('Google n’a pas retourné de jeton de connexion. Réessayez.');
      await signInWithCredential(authentication(),GoogleAuthProvider.credential(result.credential.idToken));
    } else await signInWithPopup(authentication(),new GoogleAuthProvider());
    await publishSession(authentication().currentUser);
  } catch (error) {
    if (/operation-not-allowed|configuration|initialize|provider dependencies|client.id/i.test(String(error))) throw new Error('La connexion Google doit encore être activée par l’éditeur. Vous pouvez utiliser votre e-mail.');
    if(/account[ _-]*reauth[ _-]*failed/i.test(String(error))) throw new Error('Google demande de reconnecter votre compte sur ce téléphone. Ouvrez Paramètres Android → Google, vérifiez la connexion puis réessayez.');
    throw error;
  }
}
// Favoris privés : un document par lieu, synchronisation automatique entre appareils.
export async function saveFreeFavorites(ids: string[]) {
  const user=contributor();
  for (const id of ids) await setDoc(doc(db(),'members',user.uid,'favorites',id),{id,updated:serverTimestamp()});
}
export async function loadFreeFavorites(): Promise<string[]> {
  const user=authentication().currentUser; if(!user || user.isAnonymous)throw new Error('Connectez-vous.'); const ids: string[]=[]; let cursor: string|undefined;
  for (;;) {
    const page: QuerySnapshot=await getDocs(query(collection(db(),'members',user.uid,'favorites'),orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),queryLimit(20)));
    ids.push(...page.docs.filter(d=>d.data().value!==false).map(d=>d.id)); if(page.size<20) return ids; cursor=page.docs.at(-1)!.id;
  }
}

export async function loadFreeFavoriteChanges(cursor:FreeCursor|null,pageSize=10):Promise<{changes:{id:string;value:boolean}[];cursor:FreeCursor|null;hasMore:boolean}>{
 const user=authentication().currentUser;if(!user || user.isAnonymous)throw new Error('Connectez-vous.');
 const size=Math.max(1,Math.min(10,pageSize));
 const constraints:QueryConstraint[]=[orderBy('updated'),orderBy(documentId())];
 if(cursor)constraints.push(startAfter(cursor.seconds!==undefined?new Timestamp(cursor.seconds,cursor.nanoseconds||0):Timestamp.fromMillis(cursor.time),cursor.id));
 const page=await readDocs(query(collection(db(),'members',user.uid,'favorites'),...constraints,queryLimit(size)),size,'automatic');
 const last=page.docs.at(-1),stamp=last?.data().updated as Timestamp|undefined;
 return {changes:page.docs.map(d=>({id:d.id,value:d.data().value!==false})),cursor:last&&stamp?{id:last.id,time:stamp.toMillis(),seconds:stamp.seconds,nanoseconds:stamp.nanoseconds}:cursor,hasMore:page.size===size};
}

/** Vote atomique : valeur explicite pour que les relances ne doublent jamais un vote. */
export async function voteFreeReview(placeId: string, reviewId: string, value: number): Promise<FreeSharedPlace> {
  const user = contributor();
  if (![1, -1, 0].includes(value)) throw new Error('Vote invalide.');
  const ref = doc(db(), 'shared', placeId);
  return runTransaction(db(), async tx => {
    const snapshot = await tx.get(ref), old = snapshot.data();
    const review = old?.reviews?.[reviewId] as Review | undefined;
    if (!old || old.deleted || !review) throw new Error('Cet avis n’est plus disponible.');
    if (review.user_id === user.uid) throw new Error('Vous ne pouvez pas voter pour votre propre avis.');
    const voters = (review.voters || []).filter(id => id !== user.uid);
    const downvoters = (review.downvoters || []).filter(id => id !== user.uid);
    if (value === 1) voters.push(user.uid);
    if (value === -1) downvoters.push(user.uid);
    const next = { ...old, reviews: {...old.reviews, [reviewId]: {...review, voters, downvoters, votes:voters.length, downvotes:downvoters.length}}, version:old.version + 1, place:{...old.place,version:old.version + 1}, updated:serverTimestamp(), voteReview:reviewId };
    const badgeRef=doc(db(),'members',review.user_id,'badges','helpful');
    const badge=isHelpfulReview(next.reviews[reviewId]) ? await tx.get(badgeRef) : null;
    tx.update(ref, next);
    if(badge && !badge.exists())tx.set(badgeRef,{placeId,reviewId,earned:serverTimestamp()});
    return unpack(placeId, {...next, updated:Timestamp.now()});
  });
}

export async function getFreeHelpfulBadge(candidateId?:string):Promise<boolean> {
 const account=getFreeSession();if(!account)return false;
 const {db:local}=await import('./store');const key=`helpful-cache:${account.uid}`;
 const cached=(await local.meta.get(key))?.value as {checked:number;value:boolean;candidate?:string}|undefined;
 if(cached?.value || (cached && cached.candidate===candidateId && Date.now()-cached.checked<86400000))return cached!.value;
 const badgeRef=doc(db(),'members',account.uid,'badges','helpful');
 let value=false;
 try{await reserveAccountReads(3);value=(await rawGetDoc(badgeRef)).exists();}catch(error){if(isAutomaticReadLimit(error))return cached?.value||false;throw error;}
 if(!value && candidateId && account.verified){
  // Cette vérification automatique utilise elle aussi le budget commun.
  const settle=await reserveAccountReads(9);
  value=await rawRunTransaction(db(),async tx=>{const badge=await tx.get(badgeRef),place=await tx.get(doc(db(),'shared',candidateId));if(badge.exists())return true;const review=place.data()?.reviews?.[account.uid];if(!place.exists()||place.data()!.deleted||!review||!isHelpfulReview(review))return false;tx.set(badgeRef,{placeId:candidateId,reviewId:account.uid,earned:serverTimestamp()});return true;},{maxAttempts:1});
  await settle(6);
 }
 await local.meta.put({key,value:{checked:Date.now(),value,...(candidateId?{candidate:candidateId}:{})}});return value;
}

export async function applyFreeModeration(uid: string, action: FreeModerationDecision['action'], reason: string, expectedId: string | null, evidence?: {placeId: string; review: Review}) {
  if (!getFreeSession()?.isAdmin) throw new Error('Accès administrateur nécessaire.');
  const text = reason.trim();
  if (text.length < 5 || text.length > 1500) throw new Error('Motif : 5 à 1 500 caractères.');
  const id = crypto.randomUUID();
  const ref = doc(db(), 'members', uid);
  await runTransaction(db(), async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Compte introuvable.');
    if ((snapshot.data().moderation?.id || null) !== expectedId) throw new Error('Une autre décision a été prise. Actualisez avant de poursuivre.');
    if (evidence) {
      const place = await tx.get(doc(db(), 'shared', evidence.placeId));
      const review = place.data()?.reviews?.[uid];
      if (!review || review.updated !== evidence.review.updated || review.text !== evidence.review.text || review.stars !== evidence.review.stars) throw new Error('L’avis a changé. Relisez-le avant de décider.');
    }
    const days = action === 'suspend_7' ? 7 : action === 'suspend_30' ? 30 : 0;
    const moderation = {id, action, reason:text, until:Timestamp.fromMillis(days ? Date.now() + days * 86400000 : 0), decidedAt:serverTimestamp()};
    tx.update(ref, {blocked:['suspend_7','suspend_30','ban'].includes(action), moderation});
    tx.set(doc(db(), 'members', uid, 'decisions', id), {...moderation, by:authentication().currentUser!.uid});
  });
}
export async function getFreeModerationHistory(uid: string): Promise<FreeModerationDecision[]> {
  const page = await getDocs(query(collection(db(), 'members', uid, 'decisions'), orderBy('decidedAt', 'desc'), queryLimit(20)));
  return page.docs.map(d => moderationDecision(d.data())!);
}
export async function getFreeMemberModeration(uid: string): Promise<FreeModerationDecision | undefined> {
  const member = await getDoc(doc(db(), 'members', uid));
  return moderationDecision(member.data()?.moderation);
}

export async function setFreeFavorite(id:string,value:boolean) {
 if(deletingAccount)throw new Error('Suppression du compte en cours.');
 const user=authentication().currentUser;if(!user || user.isAnonymous)throw new Error('Connectez-vous.');
 await setDoc(doc(db(),'members',user.uid,'favorites',id),{id,value,updated:serverTimestamp()});
}
