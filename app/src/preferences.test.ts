import {afterEach,it,expect,vi} from 'vitest';
import {normalizeFilters,storedOrigin,storedFilters} from './preferences';
import {defaults} from './geo';
import {LYON} from './types';
afterEach(()=>vi.unstubAllGlobals());
it('répare les réglages partiels ou corrompus sans toucher aux contributions',()=>{
 expect(normalizeFilters({categories:null,transitModes:42,radius:'invalide',minRating:Infinity})).toEqual(defaults);
 expect(normalizeFilters([])).toEqual(defaults);
 expect(normalizeFilters(null)).toEqual(defaults);
});
it('conserve les choix valides, y compris une liste volontairement vide',()=>{
 expect(normalizeFilters({categories:[],transitModes:['bus','bus','invalid'],radius:2000,open:true})).toMatchObject({categories:[],transitModes:['bus'],radius:2000,open:true});
 expect(normalizeFilters({radius:-2,minRating:40})).toMatchObject({radius:100,minRating:5});
});
it('tolère un ancien JSON incomplet et une position invalide',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>'{"lat":null,"lon":4.8}'});expect(storedOrigin()).toEqual(LYON);
 vi.stubGlobal('localStorage',{getItem:()=>'{'});expect(storedFilters('filters-v10',defaults)).toEqual(defaults);
});
