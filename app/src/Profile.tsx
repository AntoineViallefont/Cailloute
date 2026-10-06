import { PasswordField } from './PasswordField';
import { FreeDataStatus } from "./FreeCollaboration";
import { FreeCollaboration } from "./FreeCollaboration";
import { freeCollaborationEnabled, getFreeSession, subscribeFreeSession } from "./free-cloud";
import { BlockedUsers } from "./BlockedUsers";
import { AccountModeration, ModerationStatus } from "./AccountModeration";
import { ProfileAvatar, ProfileAvatarEditor, avatarKey } from "./ProfileAvatar";
import { ReviewModeration } from "./ReviewModeration";
import { TERMS_VERSION } from "./legal";
import { About } from "./About";
import { AccountOptions } from "./AccountOptions";
import { TermsGate } from "./TermsGate";
import { ContributionRewards } from "./ContributionRewards";
import { useConfirmation } from "./Confirmation";
import { suggestionsEnabled, setSuggestionsEnabled } from "./nearby-prompt";
import { MapOffline } from "./MapOffline";
import { appVersion } from "./launch";
import { useEffect, useState } from "react";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { useLiveQuery } from "dexie-react-hooks";
import {
  RefreshCw,
  LogOut,
  Trash2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { personalMode } from "./personal";
import { Modal } from "./Modal";
import {
  db,
  user,
  authenticate,
  logout,
  api,
  apiBase,
  changeServer,
  sync,
  syncState,
  retry,
  discard,
  enqueue,
  native,
} from "./store";
import type { Pending } from "./types";
export function Auth({
  onClose,
  toast,
}: {
  onClose: () => void;
  toast: (s: string) => void;
}) {
  const [create, setCreate] = useState(false);
  const [available, setAvailable] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass,setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={create ? "Créer un compte" : "Se connecter"}
      onClose={onClose}
    >
      <AccountOptions onAvailability={setAvailable} onDone={() => { toast("Vous êtes connecté."); onClose(); }} />
      {available && <details><summary>Compte avec pseudonyme et mot de passe</summary>
      <button className="text-button" onClick={() => { setCreate(!create); setError(""); }}>{create ? "J’ai déjà un compte" : "Créer un compte avec pseudonyme"}</button>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (create && pass !== confirmPass) throw new Error("Les mots de passe ne correspondent pas.");
            await authenticate(name, pass, create);
            if (create) { await api("/v1/me/terms", { method: "POST", body: JSON.stringify({ version: TERMS_VERSION, adult: agreed }) }); if (user) user.terms_version = TERMS_VERSION; }
            toast("Vous êtes connecté.");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Pseudonyme
          <input
            autoComplete="username"
            minLength={3}
            maxLength={40}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <PasswordField value={pass} onChange={setPass} create={create} />
        {create && <PasswordField label="Confirmer le mot de passe" value={confirmPass} onChange={setConfirmPass} create />}
        {create && <label className="consent-row"><input required type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />Je suis majeur et j’accepte les conditions d’utilisation.</label>}
        {create && (
          <p className="muted">
            Les contributions sont publiques sous votre pseudonyme. Conservez votre mot de passe : aucun e-mail de récupération n’est demandé pour cette méthode.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Connexion…" : create ? "Créer mon compte" : "Se connecter"}
        </button>
      </form></details>}
    </Modal>
  );
}
export function Profile({
  aerial,
  onLogin,
  toast,
  onSelect,
}: {
  aerial: boolean;
  onSelect: (place: import("./types").Place) => void;
  onLogin: () => void;
  toast: (s: string) => void;
}) {
  const pending =
    useLiveQuery(() => db.queue.orderBy("created").toArray()) || [];
  const [freeAccount, setFreeAccount] = useState(getFreeSession);
  useEffect(() => subscribeFreeSession(session => setFreeAccount(session ? { ...session } : null)), []);
  const [suggestions, setSuggestions] = useState(() => suggestionsEnabled());
  const placeCount = useLiveQuery(() => db.places.filter(p=>!p.redirect&&!p.deleted&&!p.withdrawn).count(), []) || 0;
  const { ask, confirmation } = useConfirmation();
  const [modal, setModal] = useState("");
  const [server, setServer] = useState(apiBase());
  const [error, setError] = useState("");
  const [sources, setSources] = useState<any>(null);
  const [conflict, setConflict] = useState<Pending | null>(null);
  async function attempt(fn: () => Promise<unknown>) {
    try {
      await fn();
      setModal("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const relevant = pending.filter((q) => q.owner === user?.id);
  let comparison: any = null;
  try {
    comparison = conflict ? JSON.parse(conflict.error || "null") : null;
    if (comparison?.detail) comparison = comparison.detail;
  } catch {}
  return (
    <section className="profile scroll">
      {confirmation}
      <h1>Profil</h1>
      <div className="account-card">
        <button disabled={freeCollaborationEnabled && !freeAccount} className="avatar-button" aria-label="Modifier la photo de profil" onClick={() => setModal("avatar")}>
          <ProfileAvatar />
        </button>
        <div>
          <h2>
            {freeCollaborationEnabled
              ? freeAccount?.displayName || "Sans compte"
              : personalMode ? "Mode personnel" : user?.username || "Bienvenue sur Cailloute"}
          </h2>

        </div>
        <button className="text-button" onClick={() => setModal("account")}>Mon compte<ChevronRight size={18}/></button>
      </div>
      {modal === "account" && <Modal title="Mon compte" onClose={() => setModal("")}>
      {!personalMode && user && user.terms_version !== TERMS_VERSION && <TermsGate />}
      {!personalMode &&
        (user ? (
          <button className="secondary" onClick={() => void attempt(logout)}>
            <LogOut size={18} /> Se déconnecter
          </button>
        ) : (
          <button className="primary" onClick={onLogin}>
            Se connecter / créer un compte
          </button>
        ))}
      {!personalMode && (
        <>
          <div className="section-title">
            <h2>Synchronisation</h2>
            <button
              className={"icon-button " + (syncState.busy ? "spinning" : "")}
              aria-label="Synchroniser maintenant"
              disabled={syncState.busy}
              onClick={() => void sync()}
            >
              <RefreshCw />
            </button>
          </div>
          {syncState.last && (
            <p className="muted">
              Dernier envoi / réception :{" "}
              {new Date(syncState.last).toLocaleString("fr-FR")}
            </p>
          )}
          {syncState.message && <p className="notice">{syncState.message}</p>}
        </>
      )}
      {!personalMode && user && <ModerationStatus />}
      <FreeCollaboration />
      {!personalMode && <BlockedUsers />}
      {!personalMode && user?.role === "admin" && <button className="setting-row" onClick={() => setModal("accounts-moderation")}>Signalements et sanctions<ChevronRight size={18} /></button>}
      {!personalMode && user?.role === "admin" && <button className="setting-row" onClick={() => setModal("moderation")}>Avis signalés<ChevronRight size={18} /></button>}
      {!personalMode && (
        <p>
          {relevant.length} contribution{relevant.length > 1 ? "s" : ""} en
          attente
        </p>
      )}
      {!personalMode && pending.length > relevant.length && (
        <p className="notice">
          Des contributions d’un autre compte sont conservées sur cet appareil.
          Reconnectez-vous à ce compte pour les envoyer.
        </p>
      )}
      {!personalMode &&
        relevant.map((q) => (
          <article className="queue-item" key={q.id}>
            <b>
              {(
                {
                  "place.create": "Nouveau lieu",
                  "place.edit": "Correction du lieu",
                  "photo.add": "Photo",
                  "review.save": "Avis",
                  "review.vote": "Vote",
                  "favorite.set": "Favori",
                } as Record<string, string>
              )[q.operation.kind] || "Contribution"}
            </b>
            <small>{new Date(q.created).toLocaleString("fr-FR")}</small>
            {q.error && (
              <p className="error">
                {q.error.includes("current")
                  ? "Ce lieu a changé. Comparez les deux versions."
                  : q.error.slice(0, 260)}
              </p>
            )}
            <div className="row">
              {q.error?.includes("current") ? (
                <button className="text-button" onClick={() => setConflict(q)}>
                  Comparer
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() => void retry(q.id)}
                >
                  Réessayer
                </button>
              )}
              <button
                className="text-button muted"
                onClick={() => {
                  ask("Supprimer cette contribution non envoyée ?", () =>
                    discard(q.id),
                  );
                }}
              >
                Supprimer
              </button>
            </div>
          </article>
        ))}
      {!personalMode && (
        <button
          className="setting-row"
          onClick={() => {
            setServer(apiBase());
            setModal("server");
          }}
        >
          Serveur collaboratif
          <ChevronRight size={18} />
        </button>
      )}
      {(!freeCollaborationEnabled || freeAccount) && <label className="setting-row contribution-suggestions">
        <span>Suggestions de contribution</span>
        <input type="checkbox" role="switch" checked={suggestions} onChange={e => {
          try { setSuggestionsEnabled(e.target.checked); setSuggestions(e.target.checked); }
          catch { toast("Impossible de mémoriser ce réglage."); }
        }} />
      </label>}
      <button className="setting-row" onClick={() => setModal("privacy")}>Données personnelles<ChevronRight size={18}/></button>
      {!personalMode && user && (
        <button
          className="text-button danger"
          onClick={() => setModal("delete")}
        >
          <Trash2 size={17} /> Supprimer mon compte
        </button>
      )}
      </Modal>}
      {!personalMode && modal === "accounts-moderation" && user?.role === "admin" && <AccountModeration onClose={() => setModal("")} />}
      {!personalMode && modal === "moderation" && user?.role === "admin" && <ReviewModeration onClose={() => setModal("")} />}
      <FreeDataStatus />
      {(!freeCollaborationEnabled || freeAccount) && <ContributionRewards />}
      <MapOffline satellite={aerial} />
      <button className="setting-row" onClick={() => setModal("about")}>À propos<ChevronRight size={18}/></button>
      {modal === "avatar" && <ProfileAvatarEditor onClose={() => setModal("")} />}
      {modal === "about" && <About onClose={() => setModal("")} onSources={() => {
        setModal("sources");
        if (!personalMode) void api("/v1/sources").then(setSources).catch(() => setSources(null));
      }} onPrivacy={() => setModal("privacy")} />}
      <div className="profile-version"><img src="/icon.png" alt="" /><p className="version">Cailloute · version {appVersion}</p></div>
      {error && <p className="error">{error}</p>}
      {modal === "server" && (
        <Modal title="Serveur collaboratif" onClose={() => setModal("")}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void attempt(async () => {
                await changeServer(server);
                toast("Serveur enregistré.");
              });
            }}
          >
            <label>
              Adresse du serveur
              <input
                type="url"
                required
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="https://cailloute-….run.app"
              />
            </label>
            <p className="muted">
              Tous les participants utilisent la même adresse. Le serveur local
              doit rester lancé pour recevoir les contributions.
            </p>
            <button className="primary">Enregistrer</button>
            {error && <p className="error">{error}</p>}
          </form>
        </Modal>
      )}
      {modal === "sources" && (
        <Modal title="Sources et licences" onClose={() => setModal("about")}>
          <div className="prose">
            <p>
              Lieux : © contributeurs OpenStreetMap (ODbL 1.0), extractions GéoDataMine. DATAtourisme et producteurs territoriaux (Licence Ouverte 2.0), Métropole de
              Lyon, communes et SYTRAL. Les informations de provenance sont
              conservées dans le catalogue.
            </p>
            <p>
              Tracés et couleurs TCL : SYTRAL / Métropole de Lyon, Licence Ouverte 2.0, import du 16 septembre 2026. Parcours réguliers, hors déviations temporaires.
            </p>
            <p>
              Pédiatres libéraux : Annuaire Santé RPPS, Agence du Numérique en Santé, extraction du 15 septembre 2026, Licence Ouverte 2.0. Localisation par BAN / IGN. Import ponctuel ; disponibilité des consultations non fournie. Urgences pédiatriques HFME : Hospices Civils de Lyon.
            </p>
            <p>
              Plan et photographies aériennes : © IGN, Géoplateforme, Licence
              Ouverte 2.0. La date de prise de vue varie selon le secteur.
              Géocodage : BAN / IGN. Météo : Open-Meteo ; qualité de l’air :
              CAMS ENSEMBLE (indice européen).
            </p>
            <p>
              {(sources?.report?.unique_places || placeCount).toLocaleString(
                "fr-FR",
              )}{" "}
              lieux ou points d’accès après import. Les arrêts peuvent
              représenter des quais et sens distincts.
            </p>
            <p>
              Les sources dont la licence reste à confirmer sont exclues du
              catalogue embarqué et du serveur en mode production.
            </p>
            <a
              href="https://geoservices.ign.fr/bdortho"
              target="_blank"
              rel="noreferrer"
            >
              Photographies aériennes IGN <ExternalLink size={14} />
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              Licence OpenStreetMap <ExternalLink size={14} />
            </a>
            <a
              href="https://open-meteo.com/en/terms"
              target="_blank"
              rel="noreferrer"
            >
              Conditions météo <ExternalLink size={14} />
            </a>
            <a href="https://geodatamine.fr/" target="_blank" rel="noreferrer">GéoDataMine</a>
            <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licence Ouverte</a>
            <a href="/licences-composants.txt" target="_blank" rel="noreferrer">Licences des composants</a>
          </div>
        </Modal>
      )}
      {modal === "privacy" && (
        <Modal title="Vos données" onClose={() => setModal("about")}>
          <div className="prose">
            <p>
              L’autorisation de localisation se demande avec le bouton de
              localisation. Une fois accordée, l’application peut retrouver
              votre position au lancement pour centrer la carte. Une adresse
              choisie reste prioritaire.
            </p>
            <p>
              L’adresse recherchée est transmise à l’IGN. La météo contacte
              directement Open-Meteo avec une position arrondie. Les fonds de
              carte contactent l’IGN.
            </p>
            {!personalMode && (
              <p>
                La suppression du compte efface vos avis, photos, votes, favoris
                et sessions. Les corrections géographiques publiques restent
                dans la base et leur historique est anonymisé.
              </p>
            )}

          </div>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Supprimer mon compte" onClose={() => setModal("")}>
          <p>
            Vos avis, photos, votes et favoris seront supprimés. Cette action
            est définitive.
          </p>
          <button
            className="primary destructive"
            onClick={() =>
              void attempt(async () => {
                await api("/v1/me", { method: "DELETE" });
                await db.meta.delete(avatarKey());
                for (const q of relevant) await discard(q.id);
                await logout();
                toast("Compte supprimé.");
              })
            }
          >
            Confirmer la suppression
          </button>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      {conflict && comparison && (
        <Modal
          title="Comparer les corrections"
          onClose={() => setConflict(null)}
          wide
        >
          <p>
            La fiche a été modifiée depuis votre saisie. Vérifiez chaque
            différence avant de proposer votre version à nouveau.
          </p>
          <table className="comparison">
            <thead>
              <tr>
                <th>Champ</th>
                <th>Actuel</th>
                <th>Votre proposition</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(comparison.proposed || {})
                .filter(
                  ([k, v]) =>
                    JSON.stringify(v) !==
                    JSON.stringify(comparison.current?.[k]),
                )
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{String(comparison.current?.[k] ?? "—")}</td>
                    <td>{String(v ?? "—")}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <button
            className="primary"
            onClick={() =>
              void attempt(async () => {
                await enqueue(
                  "place.edit",
                  conflict.operation.place_id,
                  comparison.proposed,
                  comparison.current.version,
                );
                await discard(conflict.id);
                setConflict(null);
              })
            }
          >
            Proposer ma version après vérification
          </button>
          <button
            className="secondary"
            onClick={() =>
              void attempt(async () => {
                await discard(conflict.id);
                setConflict(null);
              })
            }
          >
            Conserver la version actuelle
          </button>
        </Modal>
      )}
    </section>
  );
}
