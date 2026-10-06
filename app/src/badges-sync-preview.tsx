import React from "react";
import {createRoot} from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "./style.css";
import {HelpfulRewardTile} from "./HelpfulRewardTile";
import {PendingContributions} from "./PendingContributions";
import {RewardIcon} from "./RewardIcon";
function Preview(){return <main style={{maxWidth:650,margin:"0 auto",padding:"24px 20px",height:"100dvh",overflowY:"auto"}}>
<h1>À valider</h1><p className="muted">Aperçu · date de synchronisation illustrative</p>
<button className="text-button" onClick={()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==="dark"?"light":"dark"}>Changer le thème</button>
<section className="rewards-card"><h2>Grades et badges</h2><div className="reward-grid"><div><RewardIcon name="Premier pas"/><span>Premier pas</span><small>1 ajout</small></div><HelpfulRewardTile/></div></section>
<section className="free-collaboration" style={{marginTop:28}}><h2>Mon compte</h2><p className="muted">Antoine · compte vérifié</p><form className="form" onSubmit={e=>e.preventDefault()}><label>Pseudonyme public<input defaultValue="Antoine"/></label><button className="secondary" disabled>Enregistrer mon pseudo</button></form>
<PendingContributions count={5} message="Prochaine synchronisation prévue : 18/09/2026 à 02:00. Reprise dès l’ouverture avec Internet."/>
<button className="secondary">Se déconnecter</button></section></main>};
createRoot(document.getElementById("root")!).render(<Preview/>);
