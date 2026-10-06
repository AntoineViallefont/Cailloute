import {expect,it} from 'vitest';
import {matchesChildAge,playgroundAgeRange} from './playground-age';
import {defaults,matches} from './geo';
import {LYON,type Place} from './types';
it('comprend les bornes explicites, décimales et mois',()=>{
 for(const text of ['2–6 ans','de 2 à 6 ans','2-6','2 to 6'])expect(playgroundAgeRange(text)).toEqual({min:2,max:6});
 expect(playgroundAgeRange('6–36 mois')).toEqual({min:.5,max:3});expect(playgroundAgeRange('0,5–3 ans')).toEqual({min:.5,max:3});
 expect(playgroundAgeRange('À partir de 3 ans')).toEqual({min:3,max:Infinity});expect(playgroundAgeRange('3+')).toEqual({min:3,max:Infinity});
 expect(playgroundAgeRange('Jusqu’à 8 ans')).toEqual({min:0,max:8});expect(playgroundAgeRange('Tous les âges')).toEqual({min:0,max:Infinity});
});
it('exclut les âges inconnus sauf choix explicite, sans inventer une plage',()=>{
 expect(matchesChildAge('2-6 ans',2)).toBe(true);expect(matchesChildAge('2-6 ans',6)).toBe(true);expect(matchesChildAge('2-6 ans',7)).toBe(false);
 for(const text of ['', 'Enfants', '3 et 7 ans', '6-2 ans']){expect(matchesChildAge(text,4)).toBe(false);expect(matchesChildAge(text,4,true)).toBe(true);}
 expect(matchesChildAge('',null)).toBe(true);
});
it('applique le filtre aux jeux uniquement et le réinitialise',()=>{
 const place={id:'age-test',category:'playground',age:'3-8 ans',lat:LYON.lat,lon:LYON.lon} as Place;
 expect(matches(place,{...defaults,childAge:2},LYON)).toBe(false);expect(matches(place,{...defaults,childAge:3},LYON)).toBe(true);
 expect(matches({...place,category:'water',drinking_water:true},{...defaults,childAge:2},LYON)).toBe(true);expect(matches(place,defaults,LYON)).toBe(true);
});
it('tranches jusqu’à 12 ans : chevauchements et activités, sans inclure les plus âgés',async()=>{
 const {matchesAgeBand,ageBandForAge}=await import('./playground-age');
 expect(matchesAgeBand('2–6 ans','3-5')).toBe(true);
 expect(matchesAgeBand('2–6 ans','6-8')).toBe(true);
 expect(matchesAgeBand('9–12 ans','6-8')).toBe(false);
 expect(matchesAgeBand('13–17 ans','9-12')).toBe(false);
 expect(matchesAgeBand('6–36 mois','0-2')).toBe(true);
 expect(matchesAgeBand('', '3-5')).toBe(false);expect(matchesAgeBand('', '3-5',true)).toBe(true);
 expect(ageBandForAge(12)).toBe('9-12');expect(ageBandForAge(13)).toBe(null);
 const activity={id:'activity-age',category:'child_activity',age:'3–5 ans',lat:LYON.lat,lon:LYON.lon} as Place;
 expect(matches(activity,{...defaults,ageBand:'3-5'},LYON)).toBe(true);
 expect(matches(activity,{...defaults,ageBand:'9-12'},LYON)).toBe(false);
});
