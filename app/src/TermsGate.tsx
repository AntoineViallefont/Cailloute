import { useState } from "react";
import { TERMS_VERSION } from "./legal";
import { api, user, notify } from "./store";
import { About } from "./About";
export function TermsGate() {
  const [checked,setChecked]=useState(false),[about,setAbout]=useState(false),[status,setStatus]=useState("");
  return <div className="form"><label className="consent-row"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>Je suis majeur et j’accepte les conditions de Cailloute.</label><button className="text-button" onClick={()=>setAbout(true)}>Lire les conditions</button><button className="secondary" disabled={!checked} onClick={async()=>{try{await api("/v1/me/terms",{method:"POST",body:JSON.stringify({version:TERMS_VERSION,adult:true})});if(user){user.terms_version=TERMS_VERSION;localStorage.setItem("user",JSON.stringify(user));notify();}setStatus("Conditions acceptées. Vous pouvez contribuer.");}catch(e){setStatus((e as Error).message);}}}>Accepter les conditions</button><p role="status">{status}</p>{about&&<About onClose={()=>setAbout(false)}/>}</div>;
}
