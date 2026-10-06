import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";

export function useConfirmation() {
  const [request, setRequest] = useState<{
    title: string;
    description?: string;
    confirmLabel: string;
    action: () => void | Promise<unknown>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = (title: string, action: () => void | Promise<unknown>, confirmLabel = "Supprimer", description?: string) => {
    setError("");
    setRequest({ title, action, confirmLabel, description });
  };
  const confirmation =
    request &&
    createPortal(
      <Modal
        title={request.title}
        onClose={() => {
          if (!busy) setRequest(null);
        }}
        className="confirmation-dialog"
      >
        {request.description && <p>{request.description}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="confirmation-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            autoFocus
            onClick={() => setRequest(null)}
          >
            Annuler
          </button>
          <button
            type="button"
            className="primary danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await request.action();
                setRequest(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Traitement…" : request.confirmLabel}
          </button>
        </div>
      </Modal>,
      document.body,
    );
  return { ask, confirmation };
}
