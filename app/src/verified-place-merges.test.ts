import {it,expect} from 'vitest';
// @ts-expect-error Shared build-time JavaScript module.
import {applyVerifiedMerges,verifiedPlaceCorrection} from '../scripts/verified-place-merges.mjs';
const place=(id:string,lon=4.85)=>({id,name:'UGC',category:'child_activity',activity_type:'Cinéma',lat:45.76,lon,version:1,website:'https://www.ugc.fr/cinema.html?id=58'});
const rule={members:['a','b'],sourceKeys:[],website:'https://www.ugc.fr/cinema.html?id=58',matchFutureWebsite:true,patch:{name:'UGC Ciné Cité Part-Dieu'},maxDistance:500};
it('reconnaît une fiche importée future via l’identifiant officiel du cinéma',()=>{
 const result=applyVerifiedMerges([place('a'),place('b',4.851),place('new',4.852)],{},[rule]);expect(Object.values(result.members).map((r:any)=>r.id)).toEqual(['a','a','a']);expect(result.corrections.get('a').name).toBe(rule.patch.name);
});
it('préserve les éditions et refuse les homonymes éloignés ou une autre agence',()=>{
 const rows=[place('a'),{...place('b'),personal_edited:true},place('remote',5.1),{...place('other'),website:'https://www.ugc.fr/cinema.html?id=36'}];expect(applyVerifiedMerges(rows,{},[rule]).members).toEqual({});expect(applyVerifiedMerges([place('a'),{...place('other'),website:'https://www.ugc.fr/cinema.html?id=36'}],{},[rule]).members).toEqual({});
});

it('garde l’emplacement sélectionné et les informations corrigées au lieu du barycentre',()=>{
 const a={...place('a'),location_kind:'approximate_center',sources:[{key:'osm:way/1'}]},b={...place('b',4.851),location_kind:'point'};
 const correction=verifiedPlaceCorrection({...rule,preferredPosition:{id:'a',sourceKey:'osm:way/1'},patch:{name:'Nom pertinent',address:'Adresse complète'}},[a,b]);
 expect(correction).toMatchObject({lat:a.lat,lon:a.lon,location_kind:'approximate_center',name:'Nom pertinent',address:'Adresse complète'});
 expect(correction.lon).not.toBe((a.lon+b.lon)/2);
 expect(verifiedPlaceCorrection({...rule,preferredPosition:{id:'a'},patch:{lat:45.7601,lon:4.8501,location_kind:'point'}},[a,b])).toMatchObject({lat:45.7601,lon:4.8501,location_kind:'point'});
});
