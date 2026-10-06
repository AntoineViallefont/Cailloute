import { createContext, useContext, useEffect, useState } from 'react';
import {PhotoCredit} from './PhotoCredit';
import {photoCredit} from './photo-credit';
import { ReportedPlace } from './ReportedPlace';
import { PlaceForm } from './PlaceForm';
import { PhotoPrivacyReview } from './PhotoPrivacyReview';
import { type PrivacyPhoto } from './photo-privacy';
import { photoDataUrl, preparePhoto } from './photo-input';
import { Modal } from './Modal';
import { useConfirmation } from './Confirmation';
import {getFreeSession,watchFreeModeration} from "./free-cloud";
import {offlineMap} from "./map-cache";
import { listFreeReports, listFreeContacts, deleteFreeContact, listFreeBlockedMembers, getFreeReportedPlace, moderateFreeReport, resolveFreeReport, applyFreeModeration, getFreeModerationHistory, getFreeMemberModeration, type FreeReport, type FreeContact, type FreeSharedPlace, type FreeModerationDecision } from './free-cloud';
const liveService = {listFreeReports,listFreeContacts,deleteFreeContact,listFreeBlockedMembers,getFreeReportedPlace,moderateFreeReport,resolveFreeReport,applyFreeModeration,getFreeModerationHistory,getFreeMemberModeration};
const Service = createContext(liveService);
export function FreeModeration({onClose, service=liveService}:{onClose:()=>void;service?:typeof liveService}) { return <Service.Provider value={service}><ModerationPanel onClose={onClose}/></Service.Provider>; }
export const moderationLabels = {warning:'Avertissement',suspend_7:'Restriction de 7 jours',suspend_30:'Restriction de 30 jours',ban:'Suspension sans échéance',restore:'Contributions rétablies'};
function AccountDecision({uid, evidence, onDone}: {uid:string; evidence?: {placeId:string; review: NonNullable<FreeSharedPlace>['reviews'][number]}; onDone:()=>Promise<void>}) {
  const {getFreeModerationHistory,getFreeMemberModeration,applyFreeModeration}=useContext(Service);
  const [history,setHistory]=useState<FreeModerationDecision[]>([]),[current,setCurrent]=useState<FreeModerationDecision>();
  const [action,setAction]=useState<FreeModerationDecision['action']>('warning'),[reason,setReason]=useState(''),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  const {ask,confirmation}=useConfirmation();
  useEffect(()=>{let active=true;Promise.all([getFreeModerationHistory(uid),getFreeMemberModeration(uid)]).then(([h,c])=>{if(active){setHistory(h);setCurrent(c);setLoaded(true);}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[uid]);
  return <details><summary>Compte de l’auteur · décisions et historique</summary>{confirmation}
    <p className="muted">Décision manuelle après abus confirmé. Aucun blocage automatique lié aux pouces négatifs.</p>
    {history.map(d=><p key={d.id}><b>{moderationLabels[d.action]}</b> · {new Date(d.decidedAt).toLocaleDateString('fr-FR')}<br/>{d.reason}{d.until>0 && <><br/>Fin : {new Date(d.until).toLocaleString('fr-FR')}</>}</p>)}
    <form className="form" onSubmit={e=>{e.preventDefault();ask(`Appliquer : ${moderationLabels[action]} ?`,async()=>{await applyFreeModeration(uid,action,reason,current?.id || null,evidence);setHistory(await getFreeModerationHistory(uid));setCurrent(await getFreeMemberModeration(uid));setReason('');await onDone();},'Confirmer');}}>
      <label>Décision<select value={action} onChange={e=>setAction(e.target.value as typeof action)}>{Object.entries(moderationLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Motif transmis au contributeur<textarea required minLength={5} maxLength={1500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button className="secondary" disabled={!loaded || reason.trim().length<5}>Appliquer la décision</button>
      {error && <p className="error">{error}</p>}
    </form>
  </details>;
}
function ModerationPanel({onClose}:{onClose:()=>void}) {
  const {listFreeReports,listFreeContacts,deleteFreeContact,listFreeBlockedMembers,getFreeReportedPlace,moderateFreeReport,resolveFreeReport}=useContext(Service);
  const [reports,setReports]=useState<FreeReport[]>([]),[contacts,setContacts]=useState<FreeContact[]>([]),[members,setMembers]=useState<{uid:string;name:string}[]>([]);
  const [revision,setRevision]=useState(0),[examined,setExamined]=useState<{uid:string;name:string}|null>(null);
  const [places,setPlaces]=useState<Record<string,FreeSharedPlace|null>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<{report:FreeReport;content:FreeSharedPlace}|null>(null),[editText,setEditText]=useState(''),[photo,setPhoto]=useState<PrivacyPhoto|null>(null);
  const {ask,confirmation}=useConfirmation();
  async function edit(report:FreeReport,content:FreeSharedPlace){setError('');setBusy(true);try{setPhoto(null);setEditText(content.reviews.find(r=>r.id===report.reviewId)?.text||'');if(report.photoId && content.savedPhoto){const blob=await (await fetch(content.savedPhoto.url)).blob();setPhoto({id:crypto.randomUUID(),original:blob,prepared:await preparePhoto(blob),automatic:[],manual:[],detectionFailed:false,reviewed:false});}setEditing({report,content});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function saveEdit(){if(!editing)return;setBusy(true);setError('');try{await moderateFreeReport(editing.report.id,'edit',editing.content,{text:editText,...(photo?{photoUrl:photoDataUrl(photo.prepared.base64)}:{})});setEditing(null);setPhoto(null);setReports(r=>r.filter(r=>r.id!==editing.report.id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function load(){setBusy(true);setError('');try{const [r,c,m]=await Promise.all([listFreeReports(),listFreeContacts(),listFreeBlockedMembers()]);setReports(r);setContacts(c);setMembers(m);setRevision(n=>n+1);setPlaces({});}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const service=useContext(Service);
  useEffect(()=>{
    if(service!==liveService){void load();return;}
    let stop:(()=>void)|undefined,active=true;
    const connect=()=>{
      stop?.();stop=undefined;
      if(!active || document.visibilityState==='hidden' || offlineMap() || !getFreeSession()?.isAdmin)return;
      stop=watchFreeModeration(rows=>{if(active)setReports(rows);},rows=>{if(active)setContacts(rows);},e=>{if(active)setError((e as Error).message);});
    };
    void listFreeBlockedMembers().then(rows=>{if(active)setMembers(rows);}).catch(e=>{if(active)setError(e.message);});
    connect();document.addEventListener('visibilitychange',connect);window.addEventListener('map-mode',connect);window.addEventListener('online',connect);window.addEventListener('offline',connect);
    return ()=>{active=false;stop?.();document.removeEventListener('visibilitychange',connect);window.removeEventListener('map-mode',connect);window.removeEventListener('online',connect);window.removeEventListener('offline',connect);};
  },[service]);
  async function read(report:FreeReport){setBusy(true);setError('');try{setPlaces(p=>({...p}));const place=await getFreeReportedPlace(report.placeId,report.photoId,report);setPlaces(p=>({...p,[report.id]:place}));}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <Modal title="Signalements et messages" onClose={onClose}>{confirmation}
    <button className="text-button" disabled={busy} onClick={()=>void load()}>Actualiser</button>
    {error && <p className="error" role="alert">{error}</p>}{busy && <p role="status">Chargement…</p>}
    <h3>Contenus signalés</h3>{!busy && reports.length===0 && <p>Aucun signalement en attente.</p>}
    {reports.map(report=>{const content=places[report.id],review=content?.reviews.find(r=>r.id===report.reviewId),reportedPhoto=report.photoId && content?.savedPhoto?.id===report.photoId?content!.savedPhoto:null;const kind=report.photoId?'photo':report.reviewId?'avis':'lieu';const target=!!content?.place && !content.deleted && (kind==='photo'?!!reportedPhoto:kind==='avis'?!!review:true);return <article className="queue-item reported-content" key={report.id}>
      <p><b>{kind==='photo'?'Photo signalée':kind==='avis'?'Avis signalé':'Lieu signalé'}</b><br/>{report.reason}</p><small>{new Date(report.created).toLocaleString('fr-FR')}</small>
      <button className="text-button" disabled={busy} onClick={()=>void read(report)}>Voir le contenu actuel</button>
      {report.id in places && <div className="notice"><b>{content?.place?.name || 'Lieu supprimé'}</b>{reportedPhoto && <img src={reportedPhoto.url} alt="Photo signalée" style={{maxWidth:'100%',maxHeight:150,display:'block',borderRadius:12,marginTop:6}}/>}{reportedPhoto&&<PhotoCredit caption={reportedPhoto.caption}/>} {kind==='lieu' && content?.place ? <ReportedPlace place={content.place}/> : review ? <p>{review.author} · {review.stars}/5<br/>{review.text}</p>:<p>{report.reviewId ? 'Avis absent ou déjà supprimé.' : report.photoId ? (photoCredit(reportedPhoto?.caption||'')?'':reportedPhoto?.caption) || (reportedPhoto?'':'Photo absente ou déjà supprimée.') : content?.place?.description || content?.place?.address}</p>}</div>}
      <div className="row moderation-actions">
        <button className="text-button" disabled={busy || !(report.id in places)} onClick={()=>ask('Rejeter le signalement et conserver le contenu ?',async()=>{await resolveFreeReport(report.id,false);setReports(r=>r.filter(r=>r.id!==report.id));},'Conserver le contenu')}>Rejeter le signalement</button>
        <button className="text-button" disabled={busy || !target} onClick={()=>void edit(report,content!)}>{kind==='photo'?'Modifier la photo':kind==='avis'?'Modifier l’avis':'Modifier le lieu'}</button>
        <button className="text-button danger" disabled={busy || !target} onClick={()=>ask(kind==='photo'?'Supprimer définitivement cette photo ?':kind==='avis'?'Supprimer définitivement cet avis et ses votes ?':'Supprimer définitivement ce lieu et son contenu ?',async()=>{await moderateFreeReport(report.id,'remove',content!);if(review)setExamined({uid:review.user_id,name:review.author});setReports(r=>r.filter(r=>r.id!==report.id));})}>{kind==='photo'?'Supprimer la photo':kind==='avis'?'Supprimer l’avis':'Supprimer le lieu'}</button>
      </div>
      {review && <AccountDecision key={`${review.user_id}:${revision}`} uid={review.user_id} evidence={{placeId:report.placeId,review}} onDone={load}/>}
    </article>})}
    {editing && !editing.report.photoId && !editing.report.reviewId && editing.content.place && <PlaceForm place={editing.content.place} aerial={false} position={editing.content.place} onClose={()=>setEditing(null)} onCommit={payload=>moderateFreeReport(editing.report.id,'edit',editing.content,{place:payload})} onSaved={()=>{setEditing(null);void load();}}/>}
    {editing?.report.photoId && photo && <PhotoPrivacyReview editing photo={photo} number={1} total={1} onClose={()=>{setEditing(null);setPhoto(null);}} onSave={async value=>{await moderateFreeReport(editing.report.id,'edit',editing.content,{photoUrl:photoDataUrl(value.prepared.base64)});setReports(r=>r.filter(r=>r.id!==editing.report.id));setEditing(null);setPhoto(null);}}/>}
    {editing?.report.reviewId && <Modal title="Modifier l’avis" onClose={()=>{if(!busy)setEditing(null);}}>
      <label>Texte de l’avis<textarea value={editText} maxLength={1000} rows={6} onChange={e=>setEditText(e.target.value)}/></label>
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy || !editText.trim()} onClick={()=>void saveEdit()}>Enregistrer la correction</button>
    </Modal>}
    {examined && <section className="queue-item"><h3>Compte examiné : {examined.name}</h3><AccountDecision key={`${examined.uid}:${revision}`} uid={examined.uid} onDone={load}/></section>}
    <h3>Comptes sous restriction</h3>{!members.length && <p>Aucune restriction active.</p>}{members.map(m=><article className="queue-item" key={m.uid}><b>{m.name}</b><AccountDecision key={`${m.uid}:${revision}`} uid={m.uid} onDone={load}/></article>)}
    <h3>Messages et contestations</h3>{!contacts.length && <p>Aucun message.</p>}{contacts.map(c=><article className="queue-item" key={c.id}><small>{new Date(c.created).toLocaleString('fr-FR')}</small><p style={{whiteSpace:'pre-wrap'}}>{c.message}</p><button className="text-button danger" disabled={busy} onClick={()=>ask("Supprimer ce message ?",async()=>{await deleteFreeContact(c);await load();},"Supprimer le message","Cela efface uniquement le message. Le compte concerné et ses données ne sont pas supprimés par cette action.")}>Supprimer le message</button></article>)}
  </Modal>;
}
