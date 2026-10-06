import {describe,it,expect} from 'vitest';
import {matchingPhotoPlace,photoSourceIds,detailIdentity} from './detail-sources';
import {sameVenue} from './place-match';
import {mergeInitialGroups} from './catalog-migration';
import type {Place,Category} from './types';
const place={id:'a',name:'Comœdia',category:'child_activity',lat:45.7474,lon:4.8355185,address:'',city:'Lyon',activity_type:'Cinéma'} as Place;
describe('identité des fiches et sources photo',()=>{
 it('reconnaît Comoedia et Comœdia à proximité',()=>expect(matchingPhotoPlace({...place,id:'local',name:'Comoedia'},[place])).toBe('a'));
 it('ne choisit pas un homonyme éloigné ou plusieurs correspondances',()=>{
  expect(matchingPhotoPlace({...place,id:'local'},[{...place,lat:46}])).toBeUndefined();
  expect(matchingPhotoPlace({...place,id:'local'},[place,{...place,id:'b'}])).toBeUndefined();
 });
 it('invalide le rattachement photo après déplacement ou changement de nom',()=>{
  const record={identity:detailIdentity(place),sources:['other']};
  expect(photoSourceIds(place,record)).toEqual(['a','other']);expect(photoSourceIds({...place,name:'Autre'},record)).toEqual(['a']);
 });
 it('fusionne Lugdunum malgré les deux entrées GPS et les suffixes postaux',()=>{
  const a={...place,id:'dt',name:'Lugdunum - Musée et Théâtres romains',activity_type:'Musée',address:'17 rue Cléberg',lat:45.758841,lon:4.820488};
  const b={...a,id:'culture',name:'Lugdunum - musée et théâtres romains',address:'17 rue Cléberg, 69005 Lyon, France',lat:45.760529,lon:4.82004};
  const groups=mergeInitialGroups([a,b],{dt:{id:'dt'},culture:{id:'culture'}});expect(groups.dt.id).toBe(groups.culture.id);
 });
 it.each(['health','baby_shop','food_shop','transit','other','playground','water','toilet','changing_table','child_activity'] as Category[])('reconnaît un même lieu nommé dans la catégorie %s',category=>{
  const a={...place,category,name:'Les Tilleuls',activity_type:undefined,address:'17 rue Cléberg'};
  const b={...a,id:'b',address:'17 rue Cléberg, 69005 Lyon, France',lat:a.lat+.001};
  expect(sameVenue(a,b)).toBe(true);expect(mergeInitialGroups([a,b],{a:{id:'a'},b:{id:'b'}}).a.id).toBe(mergeInitialGroups([a,b],{a:{id:'a'},b:{id:'b'}}).b.id);
 });
 it('préserve les lieux distincts dans le même bâtiment et les homonymes distants',()=>{
  expect(sameVenue(place,{...place,name:'Autre cinéma'})).toBe(false);
  expect(sameVenue(place,{...place,lat:46})).toBe(false);
  expect(sameVenue({...place,address:'1 rue A'},{...place,address:'2 rue A'})).toBe(false);
 });
});
