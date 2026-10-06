import {photoCredit} from './photo-credit';
export function PhotoCredit({caption}:{caption:string}) {
  const credit = photoCredit(caption);
  return credit ? <small className="photo-credit">© {credit.author} · <a href={credit.url} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a> · Image adaptée</small> : null;
}
