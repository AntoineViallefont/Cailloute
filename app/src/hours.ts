const frenchDays: Record<string, string> = {
  Mo: "Lu",
  Tu: "Ma",
  We: "Me",
  Th: "Je",
  Fr: "Ve",
  Sa: "Sa",
  Su: "Di",
};
const osmDays = Object.fromEntries(
  Object.entries(frenchDays).map(([osm, fr]) => [fr, osm]),
);

// Les commentaires entre guillemets restent intacts ; seul le calendrier est traduit.
function translateDays(value: string, days: Record<string, string>) {
  const tokens = new RegExp(`\\b(${Object.keys(days).join("|")})\\b`, "g");
  return value
    .split(/("(?:[^"\\]|\\.)*")/g)
    .map((part, index) =>
      index % 2 ? part : part.replace(tokens, (day) => days[day]),
    )
    .join("");
}
export const frenchHours = (value: string) => translateDays(value, frenchDays);
export const standardHours = (value: string) => translateDays(value, osmDays);

const displayTokens: Record<string, string> = {
  Mo: 'lundi', Tu: 'mardi', We: 'mercredi', Th: 'jeudi', Fr: 'vendredi', Sa: 'samedi', Su: 'dimanche',
  Lu: 'lundi', Ma: 'mardi', Me: 'mercredi', Je: 'jeudi', Ve: 'vendredi', Di: 'dimanche',
  Jan: 'janvier', Feb: 'février', Mar: 'mars', Apr: 'avril', May: 'mai', Jun: 'juin',
  Jul: 'juillet', Aug: 'août', Sep: 'septembre', Oct: 'octobre', Nov: 'novembre', Dec: 'décembre',
  PH: 'jours fériés', SH: 'vacances scolaires', off: 'fermé', closed: 'fermé', open: 'ouvert',
  unknown: 'horaires incertains', week: 'semaine', easter: 'Pâques',
  sunrise: 'lever du soleil', sunset: 'coucher du soleil', dawn: 'aube', dusk: 'crépuscule',
};
/** Affichage lisible ; le champ stocké garde sa syntaxe pour le calcul d'ouverture. */
export function displayHours(value: string): string {
  if (value.trim() === '24/7') return 'Ouvert 24 h/24, 7 j/7';
  const tokens = new RegExp(`\\b(${Object.keys(displayTokens).join('|')})\\b`, 'g');
  return value.split(/("(?:[^"\\]|\\.)*")/g).map((part, index) => {
    if (index % 2) {
      const comment = part.slice(1,-1);
      const translations: Record<string,string> = {
        'Tuesdays by reservation':'Le mardi, sur réservation',
        'Winter off':'Fermé en hiver',
        'mandatory reservation by phone':'Réservation téléphonique obligatoire',
        'mornings by reservation':'Le matin, sur réservation',
        'probably closed outside summer':'Probablement fermé en dehors de l’été',
        'probably open during summer':'Probablement ouvert en été',
        'on duty':'De garde', 'summer':'En été', 'according to the park’s opening hours':'Selon les horaires du parc', 'same':'Mêmes horaires', 'on demand':'Sur demande',
        'Ouvert/open':'Ouvert', 'Reception':'Accueil',
        'De avril à novembre sur réservation':'D’avril à novembre, sur réservation',
      };
      return translations[comment] || comment;
    }
    return part.replace(/24\/7/g, '24 h/24, 7 j/7').replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\[(-?[1-5])\]/g, (_, day: string, number: string) => {
      const n = Number(number);
      return `${n === -1 ? 'dernier' : n < 0 ? `${-n}e en partant de la fin :` : n === 1 ? '1er' : `${n}e`} ${displayTokens[day]} du mois`;
    }).replace(tokens, token => displayTokens[token])
      .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, hour: string, minute: string) => `${Number(hour)} h${minute === '00' ? '' : ` ${minute}`}`)
      .replace(/\s*-\s*/g, '–').replace(/;/g, ' ; ').replace(/\|\|/g, ' ou ')
      .replace(/,/g, ', ').replace(/\s+/g, ' ').trim();
  }).join(' ').replace(/\s+/g, ' ').trim();
}
