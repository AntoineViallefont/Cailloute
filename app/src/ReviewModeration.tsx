import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, db, sync } from "./store";
import { Modal } from "./Modal";
import { useConfirmation } from "./Confirmation";
interface ReviewReport {
  id: string; created: string; reason: string; reporter: string; place_name: string;
  review: { id: string; text: string; stars: number; updated: string; author: string };
}
export function ReviewModeration({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { ask, confirmation } = useConfirmation();
  async function load() {
    setLoading(true); setError("");
    try { const result = await api<{ reports: ReviewReport[] }>("/v1/review-reports"); setReports(result.reports); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function decide(report: ReviewReport, approve: boolean) {
    setBusy(true); setError("");
    try {
      await api(`/v1/review-reports/${encodeURIComponent(report.id)}/decision`, { method: "POST", body: JSON.stringify({ approve, review_updated: report.review.updated }) });
      setReports(previous => previous.filter(r => approve ? r.review.id !== report.review.id : r.id !== report.id));
      if (approve) {
        await db.details.toCollection().modify(detail => { detail.reviews = detail.reviews.filter(r => r.id !== report.review.id); });
        await sync();
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal title="Avis signalés" onClose={onClose} actions={<button className="icon-button" aria-label="Actualiser les signalements" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={18} /></button>}>
    {confirmation}
    {loading && <p role="status">Chargement…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && !reports.length && <p>Aucun avis signalé en attente.</p>}
    {reports.map(report => <article className="review moderation-review" key={report.id}>
      <h3>{report.place_name}</h3>
      <p><strong>{report.review.author}</strong> · {report.review.stars}/5</p>
      <blockquote>{report.review.text}</blockquote>
      <p className="muted">Signalé par {report.reporter} · {new Date(report.created).toLocaleDateString("fr-FR")}</p>
      <p>{report.reason}</p>
      <div className="moderation-actions">
        <button className="secondary" disabled={busy || loading} onClick={() => void decide(report, false)}>Rejeter le signalement</button>
        <button className="primary destructive" disabled={busy || loading} onClick={() => ask("Supprimer définitivement cet avis ?", () => decide(report, true))}>Supprimer l’avis</button>
      </div>
    </article>)}
  </Modal>;
}
