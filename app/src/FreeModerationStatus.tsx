import { useEffect, useState } from 'react';
import { type FreeSession, reloadFreeSession, sendFreeContact } from './free-cloud';
import { moderationLabels } from './FreeModeration';
export function FreeModerationStatus({account}:{account:FreeSession}) {
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const update=()=>{if(document.visibilityState==='visible')void reloadFreeSession().catch(()=>{})};window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);const timer=account.moderation?.until && account.moderation.until>Date.now()?window.setTimeout(update,Math.min(account.moderation.until-Date.now()+100,2147483647)):undefined;return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);clearTimeout(timer)}},[account.moderation?.until]);
 const d=account.moderation;
 if(!d) return account.blocked ? <p className="notice">Contributions suspendues. Contactez l’éditeur dans À propos pour contester.</p> : null;
 const expired=d.until>0 && d.until<=Date.now();
 return <section className="notice" aria-label="Décision de modération"><b>{expired?'Restriction terminée':moderationLabels[d.action]}</b><p>{d.reason}</p>{d.until>0 && <small>Fin : {new Date(d.until).toLocaleString('fr-FR')}</small>}{account.blocked && <p>La consultation reste accessible. Les nouvelles contributions publiques et les votes sont suspendus.</p>}
 {d.action!=='restore' && <button className="text-button" onClick={()=>setOpen(!open)}>Contester la décision</button>}
 {open && <form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{await sendFreeContact(`Contestation de la décision ${d.id} (${moderationLabels[d.action]}) :\n${text.trim()}`);setOpen(false);setText('');setMessage('Contestation transmise à l’éditeur.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}><label>Votre explication<textarea required minLength={10} maxLength={1500} value={text} onChange={e=>setText(e.target.value)}/></label><button className="secondary" disabled={busy || text.trim().length<10}>Envoyer la contestation</button></form>}{message && <p role="status">{message}</p>}
 </section>;
}
