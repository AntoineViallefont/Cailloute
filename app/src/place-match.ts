import type { Place, Category } from "./types";
import { distance } from "./geo";
export const groupingDistance: Record<Category,number> = {other:0,health:0,child_activity:0,playground:80,toilet:30,changing_table:30,water:20,baby_shop:30,food_shop:30,transit:40};
export const PROXIMITY_MERGE_METRES = 20;
export const normalizeIdentity = (s:string) => s.toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^a-z0-9]+/g," ").trim();
/** Une activité peut avoir plusieurs points d'entrée dans les catalogues nationaux. */
export function sameVenue(a:Place,b:Place):boolean {
 if(b.category!==a.category||!a.name?.trim()||normalizeIdentity(a.name)!==normalizeIdentity(b.name))return false;
 if(a.activity_type&&b.activity_type&&normalizeIdentity(a.activity_type)!==normalizeIdentity(b.activity_type))return false;
 if(a.health_type&&b.health_type&&a.health_type!==b.health_type)return false;
 if(a.category==='transit'&&[...(a.transit_modes||[])].sort().join()!==[...(b.transit_modes||[])].sort().join())return false;
 const metres=distance(a,b);if(metres>250)return false;
 const street=(s:string)=>normalizeIdentity(s.split(',')[0]).replace(/\bav\b/g,'avenue').replace(/\bbd\b/g,'boulevard');
 const aa=street(a.address||''),ba=street(b.address||'');
 const generic=/^(pharmacie|medecin|pediatre|urgences|aire de jeux|jeux pour enfants|toilettes publiques|toilettes|fontaine|point d eau potable|arret de transport|magasin|activite enfant|musee)$/;
 if(generic.test(normalizeIdentity(a.name)))return false;
 if(aa&&ba)return aa===ba && /\d/.test(aa);
 return metres<=40;
}
export function identityName(p:Pick<Place,"name"|"category">) {
  let s=normalizeIdentity(p.name);
  if(p.category==="playground") s=s.replace(/\b(aires?|jeux|enfants|square|parc|jardin|espace)\b/g," ");
  if(p.category==="toilet"||p.category==="changing_table") s=s.replace(/\b(toilettes?|publiques?|wc|table|langer|change)\b/g," ");
  if(p.category==="water") s=s.replace(/\b(fontaine|point|eau|potable|borne)\b/g," ");
  return s.replace(/\b(de|du|des|la|le|les|l|d|a|au|aux|pour)\b/g," ").replace(/\s+/g," ").trim();
}
function editDistance(a:string,b:string) {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {const next=[i];for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}
  return row[b.length];
}
export function similarPlaceNames(a:Place,b:Place) {
  const x=identityName(a),y=identityName(b);
  if(!x||!y)return false;
  if(x===y)return true;
  // Les numéros, directions et groupes d'âge distinguent des équipements réels.
  const qualifiers=(s:string)=>(s.match(/\b(\d+|nord|sud|est|ouest|petits|grands)\b/g)||[]).sort().join();
  if(qualifiers(x)!==qualifiers(y))return false;
  const left=x.split(" ").sort().join(" "),right=y.split(" ").sort().join(" ");
  return left===right || (Math.min(left.length,right.length)>=6 && editDistance(left,right)/Math.max(left.length,right.length)<=.15);
}
export function compatiblePlaceIdentity(a:Place,b:Place) {
  if(a.category!==b.category)return false;
  if(a.category==="health" && a.health_type && b.health_type && a.health_type!==b.health_type)return false;
  if(a.category==="child_activity" && a.activity_type && b.activity_type && normalizeIdentity(a.activity_type)!==normalizeIdentity(b.activity_type))return false;
  // Les variations de nom ou d’adresse des imports ne divisent pas un même point.
  if(distance(a,b)<PROXIMITY_MERGE_METRES)return true;
  if(a.category==="water"&&a.drinking_water!==b.drinking_water)return false;
  if(a.category==="transit" && [...(a.transit_modes||[])].sort().join()!==[...(b.transit_modes||[])].sort().join())return false;
  // Le catalogue initial décrit parfois les équipements d’une même aire séparément.
  // Les détails complémentaires ne doivent pas empêcher leur regroupement.
  if (["playground", "toilet", "changing_table"].includes(a.category)) {
    const x=identityName(a), y=identityName(b);
    if (similarPlaceNames(a,b) || !x || !y) return true;
  }
  const address=(p:Place)=>normalizeIdentity(p.address||"").replace(/\bav\b/g,"avenue").replace(/\bbd\b/g,"boulevard");
  const aa=address(a),ba=address(b);
  if(aa&&ba&&aa!==ba)return false;
  if(a.city&&b.city&&normalizeIdentity(a.city)!==normalizeIdentity(b.city))return false;
  if(similarPlaceNames(a,b))return true;
  const x=identityName(a),y=identityName(b);
  // Une adresse numérotée autorise un nom manquant, pas deux noms différents.
  if(aa===ba && /\d/.test(aa) && (!x||!y))return true;
  // Les noms génériques ne suffisent qu'à très courte distance.
  return !x&&!y&&distance(a,b)<=10;
}
