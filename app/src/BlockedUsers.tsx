import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { api, apiBase, user } from "./store";
import { Modal } from "./Modal";
import { blockKey, readBlocks, cacheBlocks, type BlockedPerson } from "./block-cache";
function subscribe(listener: () => void) {
  window.addEventListener("blocked-users-changed", listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener("blocked-users-changed", listener); window.removeEventListener("storage", listener); };
}
export function useBlockedPeople() {
  const key = blockKey(apiBase(), user?.id);
  const snapshot = useSyncExternalStore(subscribe, () => localStorage.getItem(key) || "[]");
  return useMemo(() => readBlocks(key), [key, snapshot]);
}
async function updateBlock(person: BlockedPerson, value: boolean) {
  const key = blockKey(apiBase(), user?.id);
  if (user) await api("/v1/me/blocks", { method: "POST", body: JSON.stringify({ blocked_id: person.id, value }) });
  cacheBlocks(key, [...readBlocks(key).filter(p => p.id !== person.id), ...(value ? [person] : [])]);
}
export function AuthorActions({ person, onReport, toast }: { person: BlockedPerson; onReport: () => void; toast: (message: string) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <>
    <button className="text-button" aria-label={`Options pour ${person.username}`} onClick={() => { setError(""); setOpen(true); }}><MoreHorizontal size={18} /></button>
    {open && <Modal title={person.username} onClose={() => setOpen(false)}>
      <div className="form">
        <button className="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await updateBlock(person, true); setOpen(false); toast("Ses avis et photos sont masqués pour vous."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Bloquer pour moi</button>
        <button className="secondary" disabled={busy} onClick={() => { setOpen(false); onReport(); }}>Signaler</button>
        <p className="muted">Le blocage masque ses avis et photos pour vous. Il ne change ni les lieux ni les droits de son compte.</p>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </Modal>}
  </>;
}
export function BlockedUsers() {
  const entries = useBlockedPeople();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(""), [error, setError] = useState("");
  return <>
    <button className="setting-row" onClick={() => { setError(""); setOpen(true); }}><span>Utilisateurs bloqués{entries.length ? ` · ${entries.length}` : ""}</span><ChevronRight size={18} /></button>
    {open && <Modal title="Utilisateurs bloqués" onClose={() => setOpen(false)}>
      {!entries.length && <p>Aucun utilisateur bloqué.</p>}
      {entries.map(person => <div className="setting-row" key={person.id}><span>{person.username}</span><button className="text-button" disabled={!!busy} onClick={async () => { setBusy(person.id); try { await updateBlock(person, false); } catch(e) { setError((e as Error).message); } finally { setBusy(""); } }}>Débloquer</button></div>)}
      {error && <p role="alert" className="error">{error}</p>}
    </Modal>}
  </>;
}
