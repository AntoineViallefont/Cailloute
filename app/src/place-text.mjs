// Corrections exactes : aucune traduction automatique des noms propres.
const translations = new Map(Object.entries({
  'Located on Mezzanine level -1': 'Situé en mezzanine, au niveau −1.',
  'broken, no water (may 2022)': 'Hors service, sans eau (observation de mai 2022).',
  'Cemetery water tap': 'Robinet d’eau du cimetière.',
  'water tap just left of the big roof.': 'Robinet d’eau juste à gauche du grand toit.',
  'bathrooms with drinkable water': 'Sanitaires avec eau potable.',
  'Out of season: toilets closed, parking free.': 'Hors saison : toilettes fermées et stationnement gratuit.',
  'pay for 10 minutes of water': 'Distribution d’eau payante pendant 10 minutes.',
  'Fountain located behind the low wall': 'Fontaine située derrière le muret.',
  'free for motorhome stopover customers': 'Gratuit pour les clients de l’aire de camping-cars.',
  'A natural spring easy to access from the path, just step down onto the rocks and enjoy the beautiful fresh water!': 'Source naturelle accessible depuis le chemin, en descendant sur les rochers.',
  'Tent Pitch, free to use for cyclists.': 'Emplacement de tente gratuit pour les cyclistes.',
  'drinking water tap behind the electricity pole': 'Robinet d’eau potable derrière le poteau électrique.',
  'Water present on 01/09/2023': 'Eau disponible lors de l’observation du 1er septembre 2023.',
  'cost 2€ for water (2021/02/05)': 'Eau payante : 2 € (observation du 5 février 2021).',
  'open water from March to November': 'Point d’eau ouvert de mars à novembre.',
  'Sparkling water': 'Eau pétillante.',
  'basin fed by a source in the garage of the above': 'Bassin alimenté par une source située dans le garage au-dessus.',
  'Water tap with stone basin': 'Robinet d’eau avec bassin en pierre.',
  'In April 2022 the water source was not working': 'Source hors service lors de l’observation d’avril 2022.',
  'drinkable water': 'Eau potable.',
  'Water tap from the building.': 'Robinet d’eau du bâtiment.',
  'Water tap a bit hidden - on the backside of the building.': 'Robinet d’eau peu visible, à l’arrière du bâtiment.',
  'RV water + electricity point. Free drinking water available from tap': 'Point d’eau et d’électricité pour camping-cars. Eau potable gratuite au robinet.',
  'Happy Hours : 17h00 - 20h00': 'Offres à tarif réduit de 17 h à 20 h.',
  'water closed at frost': 'Point d’eau fermé en période de gel.',
  'Push the button to get fresh water ;)': 'Appuyez sur le bouton pour obtenir de l’eau fraîche.',
  'self cleaning toilet, outside is drinking water': 'Toilettes autonettoyantes ; eau potable à l’extérieur.',
  'Drinking water outside of the toilets': 'Eau potable à l’extérieur des toilettes.',
  "Drinking water doesn't work": 'Point d’eau potable hors service.',
  'As of 2025-07-14 it was running out of water': 'Manque d’eau signalé le 14 juillet 2025.',
  'between the tables of a bar': 'Entre les tables d’un bar.',
  'Water without sanitary control. Eau sans contrôle sanitarie.': 'Eau sans contrôle sanitaire.',
  'drinkable Mineral water': 'Eau minérale potable.',
  'Toilet and drinking water for campers. You have to pay with credit card': 'Toilettes et eau potable pour les campeurs. Paiement par carte bancaire.',
  'Tap on East side of Tourist information office.': 'Robinet sur le côté est de l’office de tourisme.',
  'Manned refuge providing food and bunks from Jun-Sep, also accessible in winter': 'Refuge gardé avec restauration et couchages de juin à septembre, également accessible en hiver.',
  'Drinking water fountain': 'Fontaine d’eau potable.',
  'Barrel makes connection between tubes. Possible to get water.': 'Un tonneau relie les tuyaux ; il est possible d’y prendre de l’eau.',
  'drinking water taps on rear side of the fountain': 'Robinets d’eau potable à l’arrière de la fontaine.',
  'At the entrance of the Schoenenbourg Fort, part of the Maginot Line': 'À l’entrée du fort de Schoenenbourg, ouvrage de la ligne Maginot.',
  'fountain beside the chapel': 'Fontaine à côté de la chapelle.',
  'inside the camper parking, but publicly accessible and free (2022)': 'Dans l’aire de camping-cars ; accès public et gratuit (observation de 2022).',
  'fountain, non potable, not always running': 'Fontaine non potable, dont l’écoulement est intermittent.',
  'tap within public toilet': 'Robinet dans les toilettes publiques.',
  'A family campsite in southern France where naturism feels natural.': 'Camping familial naturiste dans le sud de la France.',
  "The neighbors drink the water here, even though it hasn't been officially approved | Les habitants du quartier boivent l'eau ici, même si elle n'est pas officiellement certifiée potable": 'Les habitants boivent cette eau, mais sa potabilité n’est pas officiellement certifiée.',
  'open vanaf half mei, tot half september, Fietsers en': 'Ouvert de mi-mai à mi-septembre. La suite de la description source est incomplète.',
}));

function unpack(value, depth = 0) {
  if (depth > 4) return String(value ?? '');
  if (Array.isArray(value)) return value.map(part => unpack(part, depth + 1)).filter(Boolean).join('\n\n');
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (/^[\["]/.test(text)) {
    try { return unpack(JSON.parse(text), depth + 1); } catch { /* Ancien export tronqué : récupérer le texte lisible. */ }
  }
  return text;
}
export function cleanPlaceText(value) {
  let text = unpack(value)
    .replace(/\\+u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\+\//g, '/')
    .replace(/\\+"/g, '"')
    .replace(/\\[nr]/g, '\n')
    .replace(/<\s*(?:br\s*\/?|\/p|\/div|\/li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(Math.min(0x10ffff, parseInt(code.startsWith('x') ? code.slice(1) : code, code.startsWith('x') ? 16 : 10))))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|eacute|egrave|ecirc|agrave|ccedil|ocirc|ugrave);/gi, (_, name) => ({nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',eacute:'é',egrave:'è',ecirc:'ê',agrave:'à',ccedil:'ç',ocirc:'ô',ugrave:'ù'})[name.toLowerCase()])
    .replace(/^\s*\[\s*"|"\s*\]\s*$/g, '')
    .replace(/"\s*,\s*"/g, '\n\n')
    .replace(/\s+,\s*(?=[A-Za-zÀ-ÿ])/g, ', ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\s+/g, ' ').trim().normalize('NFC');
  text = translations.get(text) || text;
  return text.replace(/\bindoor\b/gi, 'en intérieur').replace(/\boutdoor\b/gi, 'en extérieur');
}

/** Synthèse extractive : phrases d'origine, priorité aux conditions de visite, aucun fait ajouté. */
export function summarizePlaceText(value, maximum = 360) {
  const text = cleanPlaceText(value);
  if (text.length <= maximum) return text;
  const sentences = Array.from(new Intl.Segmenter('fr', {granularity:'sentence'}).segment(text), part => part.segment);
  const units = sentences.flatMap(sentence => {
    const trimmed = sentence.trim();
    if (trimmed.length <= maximum) return [trimmed];
    return trimmed.split(/;\s*|,\s+(?=[A-Za-zÀ-ÿ])/).map(part => part.trim()).filter(Boolean);
  });
  const seen = new Set();
  const candidates = units.map((text, index) => {
    const key = text.toLocaleLowerCase('fr').replace(/[^\p{L}\p{N}]/gu, '');
    const duplicate = seen.has(key); seen.add(key);
    const score = (index === 0 ? 4 : 0)
      + (/\b(interdit|non potable|sans contrôle|ne traite pas|fermé|réservé|obligatoire|uniquement|restriction|sur rendez-vous)\b/i.test(text) ? 12 : 0)
      + (/\b(enfants?|famille|âge|ans|gratuit|payant|tarif|réservation|accessible|accessibilité|handicap|horaire|ouvert|visite|collection|exposition|jeux|parcours|jardin|piscine)\b/i.test(text) ? 5 : 0)
      - (/\b(incontournable|unique|exceptionnel|merveilleux|havre de paix|venez|plongez)\b/i.test(text) ? 2 : 0);
    return {text, index, score, duplicate};
  }).filter(item => !item.duplicate && item.text.length <= maximum);
  const selected = []; let length = 0;
  for (const item of candidates.sort((a, b) => b.score - a.score || a.index - b.index)) {
    const phrase = /[.!?]$/.test(item.text) ? item.text : item.text + '.';
    if (length + phrase.length + (selected.length ? 1 : 0) > maximum) continue;
    selected.push({...item, text: phrase}); length += phrase.length + (selected.length > 1 ? 1 : 0);
    if (selected.length >= 4) break;
  }
  if (selected.length) return selected.sort((a,b) => a.index - b.index).map(item => item.text).join(' ');
  // Phrase exceptionnellement longue : conserver un extrait lisible, jamais un mot coupé.
  return text.slice(0, maximum - 1).replace(/\s+\S*$/, '').replace(/[,;:]$/, '') + '…';
}
