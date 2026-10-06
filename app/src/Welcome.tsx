import { Modal } from './Modal';
export function Welcome({onCreate,onLogin,onContinue}:{onCreate:()=>void;onLogin:()=>void;onContinue:()=>void}) {
 return <Modal title="Bienvenue sur Cailloute" onClose={onContinue}><p>Explorez les lieux et signalez un problème sans compte.</p><p>Connectez-vous pour contribuer, publier des avis, voter et retrouver vos favoris sur tous vos appareils.</p><div className="form welcome-actions"><button className="primary" onClick={onCreate}>Créer un compte</button><button className="secondary" onClick={onLogin}>Se connecter</button><button className="text-button" onClick={onContinue}>Continuer sans compte</button></div></Modal>;
}
