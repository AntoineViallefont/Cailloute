import { useEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { api, acceptSession, native } from "./store";
import { TERMS_VERSION } from "./legal";
import { About } from "./About";
export function AccountOptions({ onDone, onAvailability }: { onDone: () => void; onAvailability?: (available: boolean) => void }) {
  const [options,setOptions] = useState({email:false,google:false,facebook:false});
  const [email,setEmail] = useState(""); const [code,setCode] = useState(""); const [challenge,setChallenge] = useState("");
  const [agreed,setAgreed] = useState(false); const [about,setAbout] = useState(false); const [status,setStatus] = useState(""); const [busy,setBusy] = useState(false);
  const stopped = useRef(false);
  useEffect(()=>{stopped.current=false;void api("/v1/auth/options").then(value=>{setOptions(value);onAvailability?.(true);}).catch(()=>{onAvailability?.(false);setStatus("Les comptes seront disponibles après activation du service collaboratif.");});return ()=>{stopped.current=true;};},[]);
  async function social(provider: "google") {
    // Ouvrir immédiatement sur le web pour conserver l'autorisation du navigateur.
    const popup = native ? null : window.open("about:blank","cailloute-auth","popup,width=480,height=680");
    setBusy(true);setStatus("");
    try {
      const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,"0")).join("");
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
      const challenge=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
      const flow=await api("/v1/auth/oauth/start",{method:"POST",body:JSON.stringify({provider,challenge,terms:TERMS_VERSION})});
      if(native) await Browser.open({url:flow.url}); else if(popup) popup.location.href=flow.url; else throw new Error("Autorisez l’ouverture de la fenêtre de connexion.");
      setStatus("Terminez la connexion dans le navigateur, puis revenez ici.");
      for(let i=0;i<120 && !stopped.current;i++) {
        await new Promise(resolve=>setTimeout(resolve,4000));
        if(stopped.current)return;
        const result=await api("/v1/auth/oauth/finish",{method:"POST",body:JSON.stringify({flow:flow.flow,verifier})});
        if(!result.pending){ await acceptSession(result); popup?.close();if(native)await Browser.close().catch(()=>{});onDone();return; }
      }
      if(!stopped.current)setStatus("Connexion expirée. Vous pouvez réessayer.");
    }catch(e){popup?.close();if(!stopped.current)setStatus((e as Error).message);}finally{if(!stopped.current)setBusy(false);}
  }
  return <section className="form">
    <p>Compte facultatif : retrouvez votre progression et contribuez avec un pseudonyme aléatoire. Aucun nom réel ni donnée d’enfant demandé.</p>
    <label className="consent-row"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/>Je suis majeur et j’accepte les conditions d’utilisation et la politique de confidentialité.</label>
    <button type="button" className="text-button" onClick={()=>setAbout(true)}>Lire les conditions</button>
    <form className="form" onSubmit={async e=>{e.preventDefault();setBusy(true);setStatus("");try{
      if(challenge){await acceptSession(await api("/v1/auth/email/verify",{method:"POST",body:JSON.stringify({challenge,code})}));onDone();}
      else{const r=await api("/v1/auth/email/start",{method:"POST",body:JSON.stringify({email,terms:TERMS_VERSION})});setChallenge(r.challenge);setStatus("Un code valable 10 minutes a été envoyé.");}
    }catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}}>
      <label>E-mail<input type="email" required value={email} onChange={e=>{setEmail(e.target.value);setChallenge("");}} autoComplete="email" maxLength={254}/></label>
      {challenge && <label>Code reçu<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code} onChange={e=>setCode(e.target.value)}/></label>}
      <button className="primary" disabled={!agreed||busy||!options.email}>{challenge?"Confirmer le code":"Continuer par e-mail"}</button>
    </form>
    <button type="button" className="secondary" disabled={!agreed||busy||!options.google} onClick={()=>void social("google")}>Continuer avec Google</button>
    <small>La connexion traite nécessairement un identifiant personnel. Google appliquent aussi leurs propres règles de confidentialité.</small>
    {(!options.email||!options.google)&&<small>Les méthodes non disponibles sont grisées jusqu’à leur activation.</small>}
    <p role="status">{status}</p>{about&&<About onClose={()=>setAbout(false)}/>}
  </section>;
}
