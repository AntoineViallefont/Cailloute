import {isDaylight,type WeatherData} from "./weather-client";
export const WEATHER_ADVICE_SOURCES = [
 {label:"Soleil · Assurance Maladie",url:"https://www.ameli.fr/assure/sante/themes/coup-soleil/prevention"},
 {label:"Chaleur et froid · Santé publique France",url:"https://www.1000-premiers-jours.fr/fr/proteger-bebe-des-temperatures-extremes"},
 {label:"Air · Atmo France",url:"https://www.atmo-france.org/article/lindice-atmo"},
 {label:"Vigilance · Météo-France",url:"https://vigilance.meteofrance.fr/fr"},
];
// 28 °C et 10 °C sont des repères pratiques d’affichage, pas des alertes sanitaires.
export function weatherAdvice(d: WeatherData | null,now=new Date()): string[] {
 if(!d)return ["Météo indisponible."];
 const tips:string[]=[],storm=d.code!=null&&d.code>=95,windy=(d.wind??0)>=40,night=isDaylight(d,now.getTime())===false;
 if(storm)tips.push("Orage : restez dans un bâtiment, loin des arbres.");
 if((d.rain_mm??0)>=.1 || (d.rain_probability??0)>=50)tips.push("Pluie : imperméable et chaussures adaptées ; jeux glissants.");
 if(d.temperature!=null && d.temperature>=28){
  tips.push(d.temperature>=32?"Chaleur forte : privilégiez un lieu frais et des activités calmes.":night?"Chaleur : privilégiez un lieu frais et des activités calmes.":"Chaleur : sorties aux heures fraîches, pauses à l’ombre.");
  tips.push("Hydratation adaptée à l’âge ; bébé allaité : proposer le sein plus souvent.");
 }
 if(d.temperature!=null && d.temperature<=10)tips.push(d.temperature<=0?"Froid : limitez la sortie de bébé ; couches de vêtements et extrémités couvertes.":"Froid : habillez-vous chaudement, protégez mains, pieds et tête.");
 if(d.temperature!=null && d.temperature>10 && d.temperature<20)tips.push(night?(storm||windy?"Prévoyez une veste.":"Prévoyez une veste et privilégiez un parcours éclairé."):"Prévoyez une petite veste.");
 if(night && !storm && !windy && (d.aqi??0)<=80 && d.temperature!=null && d.temperature>=20 && d.temperature<32)tips.push("Privilégiez une promenade calme et un parcours éclairé.");
 if(night && !storm && !windy && d.temperature!=null && d.temperature>0 && d.temperature<=10)tips.push("Privilégiez un parcours éclairé.");
 if(windy)tips.push("Vent fort : évitez les arbres et les espaces exposés.");
 if(!night && (d.uv??0)>=3){
  tips.push("UV : ombre, vêtements, chapeau, lunettes et crème solaire SPF 50+ ; bébé sans soleil direct.");
  const hour=Number(new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'numeric',hourCycle:'h23'}).formatToParts(now).find(p=>p.type==='hour')?.value);
  tips.push(hour>=12&&hour<16?"12–16 h : évitez le soleil direct, même sous les nuages.":"Privilégiez une sortie avant midi ou après 16 h.");
 }
 if((d.aqi??0)>80)tips.push("Air très dégradé : reportez les jeux intenses dehors, surtout en cas d’asthme.");
 else if((d.aqi??0)>60)tips.push("Air dégradé : jeux calmes, loin des grands axes ; limitez les efforts intenses.");
 else if((d.aqi??0)>40)tips.push("Air moyen : éloignez-vous du trafic ; adaptez les efforts en cas de gêne respiratoire.");
 if(!tips.length)tips.push(d.temperature==null||d.code==null?"Données météo partielles.":"Conditions favorables à une sortie.");
 return tips;
}
