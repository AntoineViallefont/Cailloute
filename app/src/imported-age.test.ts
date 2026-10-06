import {expect,it} from 'vitest';import {importedAgeCorrection} from './imported-age';import type {Place} from './types';
const old={category:'playground',version:1,age:'3',sources:[{key:'osm:node/1'}]} as Place;
it('répare seulement une borne importée du même objet OSM',()=>{
 expect(importedAgeCorrection(old,{...old,age:'À partir de 3 ans'})).toBe('À partir de 3 ans');
 expect(importedAgeCorrection(old,{...old,age:'Jusqu’à 3 ans'})).toBe('Jusqu’à 3 ans');
 expect(importedAgeCorrection(old,{...old,age:'À partir de 4 ans'})).toBeNull();
});
it('préserve les corrections, contributions et sources différentes',()=>{
 const incoming={...old,age:'À partir de 3 ans'};
 for(const existing of [{...old,community:true},{...old,version:2},{...old,age:'2–6 ans'},{...old,sources:[{key:'other'}] as Place['sources']}])expect(importedAgeCorrection(existing,incoming)).toBeNull();
});
