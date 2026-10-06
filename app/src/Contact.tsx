import { freeCollaborationEnabled, getFreeSession, sendFreeContact } from "./free-cloud";
import { personalMode } from "./personal";
import { useState } from "react";
import { api } from "./store";
export function Contact({ deletion = false, subjectDefault = "", messageDefault = "" }: { deletion?: boolean; subjectDefault?: string; messageDefault?: string }) {
  const [email,setEmail] = useState(""); const [subject,setSubject] = useState(deletion ? "Suppression de compte Cailloute" : subjectDefault);
  const [message,setMessage] = useState(messageDefault); const [trap,setTrap] = useState(""); const [status,setStatus] = useState(""); const [busy,setBusy] = useState(false);
  return <form className="form" onSubmit={async e => {e.preventDefault();setBusy(true);setStatus("");try { if (trap) return; if (freeCollaborationEnabled) { if (!getFreeSession()?.verified) throw new Error("Connectez-vous et vérifiez votre e-mail dans Profil pour envoyer un message."); await sendFreeContact(`${subject}\n${email ? `Réponse : ${email}\n` : ""}${message}`); } else { if (personalMode) throw new Error("Le contact partagé n’est pas activé sur cette version."); await api("/v1/contact",{method:"POST",body:JSON.stringify({email,subject,message,website:trap})}); }setStatus("Message envoyé.");setMessage("");}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}}>
    <label>Votre e-mail · {deletion ? "pour vérifier votre demande" : "facultatif, pour recevoir une réponse"}<input type="email" autoComplete="email" maxLength={254} required={deletion} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Objet<input required minLength={3} maxLength={120} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
    <label>Message<textarea required minLength={10} maxLength={freeCollaborationEnabled ? 1500 : 5000} rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder={deletion ? "Indiquez votre pseudonyme et votre mode de connexion. Ne communiquez jamais votre mot de passe." : "Une idée, un problème ou un contenu à signaler ?"}/></label>
    <label className="contact-trap" aria-hidden="true">Site<input tabIndex={-1} autoComplete="off" value={trap} onChange={e=>setTrap(e.target.value)}/></label>
    <small>Ce message est conservé dans la boîte privée de l’éditeur, sans envoi automatique par e-mail. N’indiquez aucune information sur vos enfants. Suppression du message au plus tard 12 mois après traitement.</small>
    <button className="primary" disabled={busy}>{busy ? "Envoi…" : "Envoyer"}</button><p role="status">{status}</p>
  </form>;
}
