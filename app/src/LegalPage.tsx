import { freeCollaborationEnabled } from "./free-cloud";
import { useEffect } from "react";
import { FreeCollaboration } from "./FreeCollaboration";
import { Contact } from "./Contact";
import { introduction, legalSections, TERMS_VERSION } from "./legal";
import { finishLaunch } from "./launch";
export function LegalPage() {
  const deletion=location.pathname==="/suppression-compte";
  useEffect(finishLaunch,[]);
  return <main className="legal-page prose"><a href="/">← Cailloute</a><h1>{deletion?"Supprimer un compte Cailloute":"Cailloute · À propos et confidentialité"}</h1>
    {deletion?<><p>{freeCollaborationEnabled ? "Dans Profil → Mon compte, choisissez Supprimer mon compte puis confirmez. La suppression est automatique, sans validation de l’éditeur ; une connexion récente peut être nécessaire." : "Dans l’application : Profil → Supprimer mon compte. Sans accès à l’application, utilisez ce formulaire pour demander la suppression du compte et des données associées."}</p><p>{freeCollaborationEnabled ? "Les favoris et les données personnelles de connexion sont supprimés. Les lieux, avis, photos et votes restent dans l’application. Les avis et photos portent le nom « Compte supprimé »." : "La suppression efface avis, photos, votes, favoris, identifiants et progression. Les informations géographiques publiques peuvent rester sans lien avec votre compte. Une vérification de votre demande est nécessaire ; n’envoyez jamais de mot de passe. Réponse en principe sous un mois."}</p>{freeCollaborationEnabled ? <FreeCollaboration /> : <Contact deletion />}</>:<><p>{introduction}</p><small>Version du {TERMS_VERSION}</small>{legalSections.map(s=><section key={s.title}><h2>{s.title}</h2><p>{s.text}</p></section>)}<h2>Contact et exercice de vos droits</h2><Contact /><a href="/suppression-compte">Suppression de compte</a></>}
  </main>;
}
