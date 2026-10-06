import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { api, sync } from "./store";
import type { Place } from "./types";
interface Request { id: string; author: string; created: string; reason: string; places: Place[] }
export function DeletionRequests({ onClose }: { onClose: () => void }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ requests: Request[] }>("/v1/deletion-requests")
      .then((result) => { if (active) setRequests(result.requests); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function decide(request: Request, approve: boolean) {
    setBusy(true); setError("");
    try {
      await api(`/v1/deletion-requests/${encodeURIComponent(request.id)}/decision`, { method: "POST", body: JSON.stringify({ approve }) });
      setRequests((items) => items.filter((item) => item.id !== request.id));
      await sync();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal title="Suppressions à valider" onClose={onClose}>
    {loading && <p role="status">Chargement…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && !requests.length && <p>Aucune demande en attente.</p>}
    {requests.map((request) => <article className="review" key={request.id}>
      {request.places.map((place) => <div key={place.id}><b>{place.name}</b>{(place.address || place.city) && <p>{place.address || place.city}</p>}</div>)}
      <p className="muted">{request.author} · {new Date(request.created).toLocaleDateString("fr-FR")}</p>
      {request.reason && <p>{request.reason}</p>}
      <div className="navigation-actions">
        <button className="secondary" disabled={busy} onClick={() => void decide(request, false)}>Refuser</button>
        <button className="primary destructive" disabled={busy} onClick={() => void decide(request, true)}>Valider la suppression</button>
      </div>
    </article>)}
  </Modal>;
}
