import { ChevronRight } from 'lucide-react';
import { Modal } from './Modal';
import { Contact } from './Contact';
import { introduction, legalSections, TERMS_VERSION } from './legal';
export function About({onClose,onSources}:{onClose:()=>void;onSources?:()=>void;onPrivacy?:()=>void}) {
  const privacy=['Données et confidentialité','Conservation et suppression','Vos droits'];
  const sections=(names: string[])=>legalSections.filter(s=>names.includes(s.title)).map(s=><section key={s.title}><h3>{s.title}</h3><p>{s.text}</p></section>);
  return <Modal title="À propos de Cailloute" onClose={onClose}><div className="prose about">
    <p className="about-intro">{introduction}</p><p>Pour participer aux contributions partagées, créez un compte ou connectez-vous avec Google. La consultation reste possible sans compte.</p><p><a href="https://github.com/AntoineViallefont/Cailloute" target="_blank" rel="noreferrer">Code source, retours et bêta GitHub</a></p>
    <details><summary>Contact et aide</summary><Contact /></details>
    <details><summary>Utilisation et contributions</summary>{legalSections.filter(s=>!privacy.includes(s.title)&&s.title!=='Édition et hébergement').map(s=><section key={s.title}><h3>{s.title}</h3><p>{s.text}</p></section>)}</details>
    <details><summary>Confidentialité et droits</summary>{sections(privacy)}</details>
    <details><summary>Sources et licences</summary><p>© contributeurs OpenStreetMap — ODbL 1.0. DATAtourisme et producteurs territoriaux — Licence Ouverte 2.0. IGN / BAN, Métropole de Lyon, communes, SYTRAL, Annuaire Santé. Météo : Open-Meteo ; qualité de l’air : CAMS ENSEMBLE.</p>{onSources&&<button className="text-button" onClick={onSources}>Consulter les sources des données<ChevronRight size={18}/></button>}<p><a href="/licences-composants.txt" target="_blank" rel="noreferrer">Licences des composants</a> · <a href="/licences-android.txt" target="_blank" rel="noreferrer">Composants Android</a></p></details>
    <details><summary>Édition et hébergement</summary>{sections(['Édition et hébergement'])}<small>Conditions du {TERMS_VERSION}.</small></details>
  </div></Modal>;
}
