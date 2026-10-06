import { useEffect, useState } from "react";
import { api, photoUrl, user } from "./store";
import { Modal } from "./Modal";
import { useConfirmation } from "./Confirmation";
import { reportReasons, sanctionLabels } from "./report-reasons";
interface Appeal { id: string; username: string; message: string; reason: string; action: string }
interface Status { can_contribute: boolean; action: string | null; reason: string; until: string | null; decision_id: string | null }
interface UserReport { id: string; reason: string; category: string; reporter: string; user: { id: string; username: string }; status: Status; place_name: string; review: { text: string; updated: string } | null; photo_url: string | null }
interface RestrictedUser extends Status { id: string; username: string }
function DecisionCard({ report, onDecide, busy }: { report: UserReport; onDecide: (report: UserReport, action: string, reason: string) => void; busy: boolean }) {
  const [action, setAction] = useState("warning"), [reason, setReason] = useState("");
  return <article className="review moderation-review">
    <h3>{report.user.username}</h3><p className="muted">{report.place_name} · signalé par {report.reporter}</p>
    <p><strong>{reportReasons.find(r => r[0] === report.category)?.[1] || "Autre problème"}</strong></p><p>{report.reason}</p>
    {report.review && <blockquote>{report.review.text}</blockquote>}
    {report.photo_url && <img className="moderation-photo" src={photoUrl(report.photo_url)} alt="Photo liée au signalement" />}
    {!report.review && !report.photo_url && <p className="muted">Le contenu d’origine a été retiré. Le signalement seul ne prouve pas un abus.</p>}
    {report.status.action && <p>Dernière décision : {sanctionLabels[report.status.action]}{report.status.until ? ` · jusqu’au ${new Date(report.status.until).toLocaleString("fr-FR")}` : ""}</p>}
    <form className="form" onSubmit={e => { e.preventDefault(); onDecide(report, action, reason.trim()); }}>
      <label>Décision<select value={action} onChange={e => setAction(e.target.value)}>{["dismiss", "warning", "suspend_7", "suspend_30", "ban"].map(key => <option key={key} value={key}>{sanctionLabels[key]}</option>)}</select></label>
      <label>Motif de la décision<textarea required minLength={5} maxLength={1500} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className={action === "dismiss" || action === "warning" ? "primary" : "primary destructive"} disabled={busy || reason.trim().length < 5}>Appliquer la décision</button>
    </form>
  </article>;
}
export function AccountModeration({ onClose }: { onClose: () => void }) {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [appealTarget, setAppealTarget] = useState<Appeal | null>(null), [response, setResponse] = useState(""), [acceptAppeal, setAcceptAppeal] = useState(false);
  const [reports, setReports] = useState<UserReport[]>([]), [restricted, setRestricted] = useState<RestrictedUser[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<RestrictedUser | null>(null), [restoreReason, setRestoreReason] = useState("");
  const { ask, confirmation } = useConfirmation();
  async function load() {
    setLoading(true); setError("");
    try { const [r, a, appeals] = await Promise.all([api("/v1/user-reports"), api("/v1/moderation/accounts"), api("/v1/moderation/appeals")]); setReports(r.reports); setRestricted(a.users); setAppeals(appeals.appeals); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function decide(report: UserReport, action: string, reason: string) {
    setBusy(true); setError("");
    try { await api(`/v1/user-reports/${report.id}/decision`, { method: "POST", body: JSON.stringify({ action, reason, review_updated: report.review?.updated || null }) }); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Signalements et sanctions" onClose={onClose}>
    {confirmation}
    <button className="text-button" disabled={busy || loading} onClick={() => void load()}>Actualiser</button>
    {loading && <p role="status">Chargement…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && !reports.length && <p>Aucun utilisateur signalé en attente.</p>}
    {reports.map(r => <DecisionCard key={r.id} report={r} busy={busy || loading} onDecide={(report, action, reason) => ask(`${sanctionLabels[action]} : ${report.user.username} ?`, () => decide(report, action, reason), "Confirmer")} />)}
    <h3>Contestations</h3>
    {!appeals.length && <p>Aucune contestation en attente.</p>}
    {appeals.map(a => <article className="review" key={a.id}><strong>{a.username} · {sanctionLabels[a.action]}</strong><p>{a.reason}</p><blockquote>{a.message}</blockquote><button className="secondary" onClick={() => { setAppealTarget(a); setResponse(""); setAcceptAppeal(false); }}>Examiner la contestation</button></article>)}
    {appealTarget && <Modal title="Répondre à la contestation" onClose={() => setAppealTarget(null)}><form className="form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api(`/v1/moderation/appeals/${appealTarget.id}/decision`, { method: "POST", body: JSON.stringify({ restore: acceptAppeal, response: response.trim() }) }); setAppealTarget(null); await load(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}><label>Décision<select value={String(acceptAppeal)} onChange={e => setAcceptAppeal(e.target.value === "true")}><option value="false">Maintenir la décision</option><option value="true">Rétablir les contributions</option></select></label><label>Réponse au contributeur<textarea required minLength={5} maxLength={2000} value={response} onChange={e => setResponse(e.target.value)} /></label><button className="primary" disabled={busy || response.trim().length < 5}>Enregistrer la réponse</button>{error && <p className="error">{error}</p>}</form></Modal>}
    <h3>Suspensions actives</h3>
    {!restricted.length && <p>Aucune suspension active.</p>}
    {restricted.map(r => <div className="review" key={r.id}><strong>{r.username}</strong><p>{sanctionLabels[r.action || "ban"]}{r.until ? ` · jusqu’au ${new Date(r.until).toLocaleString("fr-FR")}` : ""}</p><p>{r.reason}</p><button className="secondary" disabled={busy} onClick={() => { setRestoreTarget(r); setRestoreReason(""); }}>Lever la suspension</button></div>)}
    {restoreTarget && <Modal title="Rétablir les contributions" onClose={() => setRestoreTarget(null)}><form className="form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api(`/v1/moderation/accounts/${restoreTarget.id}/restore`, { method: "POST", body: JSON.stringify({ decision_id: restoreTarget.decision_id, reason: restoreReason.trim() }) }); setRestoreTarget(null); await load(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}><p>{restoreTarget.username}</p><label>Motif<textarea required minLength={5} maxLength={1500} value={restoreReason} onChange={e => setRestoreReason(e.target.value)} /></label><button className="primary" disabled={busy || restoreReason.trim().length < 5}>Rétablir les contributions</button>{error && <p className="error" role="alert">{error}</p>}</form></Modal>}
  </Modal>;
}
export function ModerationStatus() {
  const [status, setStatus] = useState<(Status & { appeals?: { decision_id: string; status: string; response: string }[] }) | undefined>(user?.moderation);
  const [appeal, setAppeal] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; if (user) void api("/v1/me/moderation").then(s => { if (active) setStatus(s); }).catch(() => {}); return () => { active = false; }; }, [user?.id]);
  if (!status?.action) return null;
  const previous = status.appeals?.find(a => a.decision_id === status.decision_id);
  return <section className="notice" aria-label="Décision concernant votre compte"><strong>{sanctionLabels[status.action]}</strong><p>{status.reason}</p>{status.until && <p>{status.can_contribute ? "Terminée le " : "Jusqu’au "}{new Date(status.until).toLocaleString("fr-FR")}</p>}{!status.can_contribute && <p>Vous pouvez toujours consulter les lieux.</p>}
    {previous ? <p>{previous.status === "open" ? "Contestation envoyée, en attente d’examen." : previous.response}</p> : status.action !== "restore" && <button className="text-button" onClick={() => setAppeal(true)}>Contester cette décision</button>}
    {appeal && <Modal title="Contester une décision" onClose={() => setAppeal(false)}><form className="form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await api("/v1/me/appeals", { method: "POST", body: JSON.stringify({ decision_id: status.decision_id, message: message.trim() }) }); setStatus(await api("/v1/me/moderation")); setAppeal(false); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}><label>Votre contestation<textarea required minLength={10} maxLength={2000} rows={5} value={message} onChange={e => setMessage(e.target.value)} /></label><button className="primary" disabled={busy || message.trim().length < 10}>Envoyer à l’éditeur</button>{error && <p className="error">{error}</p>}</form></Modal>}
  </section>;
}
