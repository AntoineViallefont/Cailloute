import {nextQueueAttempt} from "./free-sync-policy";
import { PendingContributions } from "./PendingContributions";
import { AccountActions, accountDeletionMessage } from './AccountActions';
import { useConfirmation } from "./Confirmation";
import { FreeModeration } from "./FreeModeration";
import { FreeModerationStatus } from "./FreeModerationStatus";
import { PasswordField } from './PasswordField';
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Modal } from "./Modal";
import { db } from "./store";
import { loginFreeGoogle, freeCollaborationEnabled, getFreeSession, subscribeFreeSession, registerFreeAccount, loginFreeAccount, logoutFreeAccount, resendFreeVerification, reloadFreeSession, resetFreePassword, requestFreeAccountDeletion, acceptFreeTerms } from "./free-cloud";
import { runFreeSync, retryFreeContributions, freeSyncState, discardFreeOperation } from "./free-sync";
import { FREE_TERMS_VERSION } from "./free-policy";

export function FreeCollaboration({initialOpen=false,initialCreate=false,onClose}: {initialOpen?:boolean;initialCreate?:boolean;onClose?:()=>void}) {
  const {ask,confirmation}=useConfirmation();
  const [account, setAccount] = useState(getFreeSession());
  const [open, setOpen] = useState(initialOpen), [create, setCreate] = useState(initialCreate);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState(""), [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [, refresh] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [sendResult,setSendResult]=useState("");
  const pending = useLiveQuery(() => db.freeQueue.toArray(), []) || [];
  const own = pending.filter(q => q.owner === account?.uid);
  const retryAt=Math.max(freeSyncState.pausedUntil,freeSyncState.nextAttempt||0,nextQueueAttempt(own,Date.now()));
  const pendingInfo=!navigator.onLine ? 'Envoi au retour de la connexion Internet.' : !account?.verified ? 'Vérifiez votre adresse e-mail pour envoyer vos contributions.' : own.some(q=>q.status==='error') ? 'Certaines contributions nécessitent votre attention ci-dessous.' : retryAt>Date.now() ? `Prochaine synchronisation prévue : ${new Date(retryAt).toLocaleDateString("fr-FR")} à ${new Date(retryAt).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})}. Reprise dès l’ouverture avec Internet.` : freeSyncState.busy ? 'Envoi en cours…' : freeSyncState.message || 'Envoi à reprendre. Réessayez pour vérifier la connexion.';
  useEffect(() => subscribeFreeSession(session => { setAccount(session ? { ...session } : null); void runFreeSync(); }), []);
  useEffect(() => { const update = () => refresh(n => n + 1); window.addEventListener("cailloute", update); return () => window.removeEventListener("cailloute", update); }, []);
  useEffect(()=>setDeleteRequested(false),[account?.uid]);
  useEffect(()=>{setName(account?.nicknameReserved ? account.displayName : "");},[account?.uid,account?.nicknameReserved]);
  if (!freeCollaborationEnabled) return null;
  async function attempt(action: () => Promise<unknown>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  const content=<section className="free-collaboration">{confirmation}
    <h2>Connexion et contributions</h2>
    <p className="muted">{account ? `${account.displayName} · ${account.verified ? "compte vérifié" : "e-mail à vérifier"}` : "Sans compte : consultation et signalement uniquement."}</p>
    {account && <FreeModerationStatus account={account} />}
    {!account ? <button className="secondary" onClick={() => setOpen(true)}>Se connecter / créer un compte</button> : <>
      <form className="form nickname-form" onSubmit={e=>{e.preventDefault();void attempt(async()=>{await acceptFreeTerms(name,agreed||account.termsAccepted);setMessage("Pseudo enregistré.");});}}>
       <label>Pseudonyme public<input required minLength={2} maxLength={40} value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname" placeholder="Choisir un pseudo unique"/></label>
       {!account.termsAccepted && <label className="consent-row"><input type="checkbox" required checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>Je suis majeur et j’accepte les <a href="/conditions" target="_blank" rel="noreferrer">conditions d’utilisation</a>.</label>}
       <button className="secondary" disabled={busy || (!!account.nicknameReserved && name===account.displayName)}>{account.nicknameReserved ? "Enregistrer mon pseudo" : "Valider mon pseudo"}</button>
      </form>
      {!account.verified && <div className="row"><button className="text-button" disabled={busy} onClick={() => void attempt(async () => { await resendFreeVerification(); setMessage("E-mail de vérification envoyé."); })}>Renvoyer l’e-mail</button><button className="text-button" disabled={busy} onClick={() => void attempt(reloadFreeSession)}>J’ai vérifié mon adresse</button></div>}
      <PendingContributions count={own.length} message={pendingInfo}/>
      {own.some(q=>q.status==='pending') && <button className="secondary" disabled={busy||freeSyncState.busy||!navigator.onLine} onClick={()=>void attempt(async()=>{
        setSendResult("Vérification et envoi en cours…");
        const timer=setTimeout(()=>setSendResult("Le serveur ne répond pas encore. Vos contributions restent conservées sur cet appareil."),15000);
        try{setSendResult(await retryFreeContributions());}catch(error){setSendResult(`Envoi impossible : ${(error as Error).message}`);}finally{clearTimeout(timer);}
      })}>{busy ? "Vérification en cours…" : "Réessayer l’envoi"}</button>}
      {sendResult && <p className="notice" role="status">{sendResult}</p>}
      {own.filter(q => q.status === "error").map(q => <article className="queue-item" key={q.id}><p className="error">{q.error}</p><small>Votre version reste locale. Une fiche modifiée par quelqu’un d’autre n’est jamais écrasée automatiquement.</small><button className="text-button" onClick={() => void discardFreeOperation(q.id)}>Garder uniquement sur cet appareil</button></article>)}
      <AccountActions busy={busy || deleteRequested} onLogout={()=>void attempt(logoutFreeAccount)} onDelete={()=>ask("Supprimer votre compte ?",async()=>{setBusy(true);try{await requestFreeAccountDeletion();setDeleteRequested(true);setMessage("Votre compte a été supprimé.");}finally{setBusy(false)}},"Supprimer mon compte",accountDeletionMessage)}/>
      {account.isAdmin && <button className="setting-row" disabled={busy} onClick={() => setAdmin(true)}>Signalements et messages</button>}
    </>}
    {pending.length > own.length && <small>Des envois d’un autre compte restent conservés sur cet appareil.</small>}
    {message && <p role="status">{message}</p>}
    {open && <Modal title={create ? "Créer un compte" : "Se connecter"} onClose={() => {setOpen(false);onClose?.();}}><form className="form" onSubmit={e => { e.preventDefault(); void attempt(async () => { if (create && password !== confirmPassword) throw new Error("Les mots de passe ne correspondent pas."); if (create) await registerFreeAccount(email, password, name, agreed); else await loginFreeAccount(email, password); setPassword(""); setOpen(false); }); }}>
      <p>Un compte permet de publier des avis, contribuer, voter et retrouver vos favoris sur tous vos appareils. La consultation reste libre.</p>
      <button type="button" className="secondary" disabled={busy} onClick={()=>void attempt(async()=>{await loginFreeGoogle();setOpen(false);})}>Continuer avec Google</button>
      <label>E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {create && <label>Pseudonyme public<input required minLength={2} maxLength={40} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" /></label>}
      <PasswordField value={password} onChange={setPassword} create={create} />
      {create && <PasswordField label="Confirmer le mot de passe" value={confirmPassword} onChange={setConfirmPassword} create />}
      {create && <label className="consent-row"><input type="checkbox" required checked={agreed} onChange={e => setAgreed(e.target.checked)} />Je suis majeur et j’accepte les <a href="/conditions" target="_blank" rel="noreferrer">conditions d’utilisation</a> ({FREE_TERMS_VERSION}).</label>}
      {message && <p className="error">{message}</p>}<button className="primary" disabled={busy}>{busy ? "Patientez…" : create ? "Créer mon compte" : "Se connecter"}</button><button type="button" className="text-button" onClick={() => { setCreate(!create); setMessage(""); }}>{create ? "J’ai déjà un compte" : "Créer un compte"}</button>{!create && <button type="button" className="text-button" disabled={busy || !email} onClick={() => void attempt(async () => { await resetFreePassword(email); setMessage("Si ce compte existe, les instructions ont été envoyées par e-mail."); })}>Mot de passe oublié</button>}
    </form></Modal>}
    {admin && account?.isAdmin && <FreeModeration onClose={() => setAdmin(false)} />}
  </section>;
  return onClose && !open ? <Modal title="Mon compte" onClose={onClose}>{content}</Modal> : content;
}

export function FreeDataStatus() {
  const [,refresh]=useState(0);
  useEffect(()=>{const update=()=>refresh(n=>n+1);window.addEventListener("cailloute",update);return()=>window.removeEventListener("cailloute",update);},[]);
  if(!freeCollaborationEnabled) return null;
  return <section className="free-collaboration" aria-label="Actualisation des données">
    {freeSyncState.last > 0 && <p className="profile-last-update">Dernière réception des modifications : {new Date(freeSyncState.last).toLocaleString("fr-FR")}</p>}
    {(freeSyncState.busy || freeSyncState.pausedUntil > Date.now()) && <p className="muted" role="status">{freeSyncState.busy ? "Échange en cours…" : `Reprise au plus tôt le ${new Date(freeSyncState.pausedUntil).toLocaleString("fr-FR")}`}</p>}
    {freeSyncState.message && <p className="notice">{freeSyncState.message}</p>}
</section>;
}
