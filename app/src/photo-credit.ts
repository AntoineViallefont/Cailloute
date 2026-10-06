/** Crédit importé, conservé avec la photo lors des modifications et signalements. */
export function photoCredit(caption:string) {
  const match = caption.match(/^@commons:([1-9]\d{0,11})\|(CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)|CC0|Public domain)\|([^\r\n|]+)$/);
  if (!match) return null;
  const [,id,license,author] = match;
  const creative = license.match(/^CC (BY(?:-SA)?) ([\d.]+)$/);
  const licenseUrl = creative ? `https://creativecommons.org/licenses/${creative[1].toLowerCase()}/${creative[2]}/`
    : license === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://commons.wikimedia.org/wiki/Commons:Public_domain';
  return {author,license,licenseUrl,url:`https://commons.wikimedia.org/?curid=${id}`};
}
