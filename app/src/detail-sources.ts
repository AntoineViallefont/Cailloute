import {placeSourceIds} from './canonical-data';
import {distance} from './geo';
import type {Place} from './types';
type Identity=Pick<Place,'id'|'name'|'category'|'lat'|'lon'> & Partial<Pick<Place,'website'|'activity_type'>>;
export type DetailSources={identity:string;sources:string[]};
const name=(s:string)=>s.toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
export const detailIdentity=(p:Identity)=>JSON.stringify([p.name,p.category,p.lat,p.lon,p.website||'',p.activity_type||'']);
export function matchingPhotoPlace(p:Place,rows:Identity[]):string|undefined {
 const matches=rows.filter(q=>q.id!==p.id && q.category===p.category && name(q.name)===name(p.name) && distance(p,q)<=40
  && (!p.activity_type || !q.activity_type || name(p.activity_type)===name(q.activity_type))
  && (!p.website || !q.website || p.website.replace(/\/$/,'')===q.website.replace(/\/$/,'')));
 return new Set(matches.map(q=>q.id)).size===1?matches[0]?.id:undefined;
}
export function photoSourceIds(p:Place,record?:DetailSources):string[]{
 return [...new Set([...placeSourceIds(p),...(record?.identity===detailIdentity(p)?record.sources:[])])];
}
