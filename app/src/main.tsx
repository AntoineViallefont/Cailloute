import {AppRecovery} from "./AppRecovery";
import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./style.css";
import App from "./App";
import { LegalPage } from "./LegalPage";
ReactDOM.createRoot(document.getElementById("root")!).render(["/confidentialite", "/conditions", "/suppression-compte"].includes(location.pathname) ? <LegalPage /> : <AppRecovery><App /></AppRecovery>);

// L'APK embarque déjà son interface ; le site garde aussi son interface hors ligne.
if (import.meta.env.PROD && !location.hostname.includes("localhost") && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}
