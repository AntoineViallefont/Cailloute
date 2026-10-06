import {describe,it,expect} from 'vitest';
import {latestReviews,uniqueReviewDetail,reviewDate,reviewTime} from './latest-reviews';
import {personalDetail,applyPersonal} from './personal';
import {canonicalDetail} from './canonical-data';
import type {Review,Detail,Place} from './types';
const review=(id:string,user_id:string,updated:string,stars=4,extra:Partial<Review>={}):Review=>({id,user_id,author:user_id,text:id,stars,created:'2026-09-17T10:00:00Z',updated,votes:0,voters:[],...extra});
const place={id:'lieu',name:'Parc',category:'playground',version:1,lat:45.75,lon:4.83,rating:4,review_count:1,photo_count:0} as Place;
describe('un seul avis par auteur et par lieu',()=>{
 it('retient la dernière modification, même pour un avis créé auparavant',()=>{
  const old=review('ancien','alice','2026-09-18'),newest=review('nouveau','alice','2026-10-02',2,{created:'2026-09-01'});
  expect(latestReviews([newest,old])).toEqual([newest]);
  expect(latestReviews([old,newest])).toEqual([newest]);
 });
 it('conserve les autres auteurs et recalcule la note sans compter les doublons',()=>{
  const old=review('ancien','alice','2026-09-18',5),newest=review('récent','alice','2026-10-02',1),other=review('autre','bob','2026-09-18',3);
  expect(uniqueReviewDetail({...place,reviews:[old,newest,other],photos:[]})).toMatchObject({review_count:2,rating:2,reviews:[newest,other]});
 });
 it('regroupe les avis du même auteur apportés par deux sources du même lieu',()=>{
  const merged=canonicalDetail(place,[{...place,id:'source-a',reviews:[review('alice','alice','2026-09-18')],photos:[]},{...place,id:'source-b',reviews:[review('alice','alice','2026-10-02',2)],photos:[]}]);
  expect(merged.reviews).toHaveLength(1);expect(merged.reviews[0].place_id).toBe('source-b');expect(merged.rating).toBe(2);
 });
 it('remplace l’avis publié pendant une modification hors connexion sans doubler son compteur',()=>{
  const base={...place,rating:5,reviews:[review('alice','alice','2026-10-02',5)],photos:[]} as Detail;
  const pending=applyPersonal(place,undefined,{id:'op',place_id:place.id,kind:'review.save',payload:{stars:2,text:'Corrigé hors connexion'}});
  const result=personalDetail(base,pending,'alice');
  expect(result.reviews).toHaveLength(1);expect(result.reviews[0].text).toBe('Corrigé hors connexion');expect(result.review_count).toBe(1);expect(result.rating).toBe(2);
 });
 it('ne confond pas l’avis privé avec celui d’un autre auteur',()=>{
  const local=review('local','personal-device','2026-10-02'),other=review('autre','bob','2026-09-18');expect(latestReviews([local,other],'alice')).toHaveLength(2);
 });
 it('utilise la création si la date de modification est absente ou invalide',()=>{
  const old=review('ancien','alice','invalide'),newest=review('récent','alice','',2,{created:'2026-10-02'});expect(latestReviews([newest,old])).toEqual([newest]);
 });
 it('n’efface pas le total des avis qui n’ont pas encore été téléchargés',()=>{
  expect(uniqueReviewDetail({...place,reviews:[],photos:[]})).toMatchObject({rating:4,review_count:1});
 });
});

it('affiche et trie la dernière modification avec repli sur la création',()=>{
 const edited=review('edited','alice','2026-10-04T15:00:00Z');
 const recent=review('recent','bob','2026-10-03T10:00:00Z');
 expect(reviewDate(edited)).toBe('2026-10-04T15:00:00Z');
 expect(reviewTime(edited)).toBeGreaterThan(reviewTime(recent));
 expect(reviewDate({...edited,updated:'invalide'})).toBe(edited.created);
 expect(reviewDate({...edited,updated:''})).toBe(edited.created);
 expect(reviewDate({...edited,updated:'2026-09-01'})).toBe(edited.created);
});
