import { ThumbsUp, MessageSquareHeart, BadgeCheck, Sparkles, HandHeart, Compass, MapPinned, TreePine, Telescope, MapPin, Route, ScanEye, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
const artwork = {
  "Avis utile · Pouce": [ThumbsUp, "#146b55", "#d9f5e7"],
  "Avis utile · Bulle et cœur": [MessageSquareHeart, "#075ca8", "#dcedff"],
  "Avis utile · Badge": [BadgeCheck, "#7833a8", "#f0e2fc"],
  "Avis utile · Étincelles": [Sparkles, "#945006", "#ffedbf"],
  "Petit coup de pouce": [HandHeart, "#146b55", "#d9f5e7"],
  "Parent éclaireur": [Compass, "#075ca8", "#dcedff"],
  "Guide des familles": [MapPinned, "#7833a8", "#f0e2fc"],
  "Pilier du quartier": [TreePine, "#226437", "#e0f1d2"],
  "Grand explorateur": [Telescope, "#945006", "#ffedbf"],
  "Premier repère": [MapPin, "#ac324b", "#ffe0e7"],
  "Ouvreur de chemins": [Route, "#0a6777", "#d4f4f7"],
  "Œil attentif": [ScanEye, "#5641a7", "#ebe5ff"],
  "Gardien des infos": [ShieldCheck, "#386321", "#e5f3d6"],
} as const;
export function RewardIcon({ name, small = false }: { name: string; small?: boolean }) {
  const [Icon, ink, paper] = artwork[name as keyof typeof artwork] || artwork["Petit coup de pouce"];
  return <span className={`reward-icon${small ? " small" : ""}`} style={{ "--reward-ink": ink, "--reward-paper": paper } as CSSProperties} aria-hidden="true">
    <Icon size={small ? 20 : 28} strokeWidth={1.8} />
    <svg className="reward-spark" width="12" height="12" viewBox="0 0 12 12"><path d="M6 0 7.7 4.3 12 6 7.7 7.7 6 12 4.3 7.7 0 6 4.3 4.3Z" fill="currentColor" /></svg>
  </span>;
}
