import type { PlaceBounds } from './store';
/** Proposer une autre zone seulement quand le point de recherche quitte l’écran. */
export function outsideSearchAnchor(view: {lat:number;lon:number;bounds?:PlaceBounds},anchor:{lat:number;lon:number}):boolean {
 const b=view.bounds;if(!b)return false;
 return anchor.lat<b.south||anchor.lat>b.north||anchor.lon<b.west||anchor.lon>b.east;
}
