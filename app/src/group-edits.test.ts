import { describe, it, expect } from 'vitest';
import { changedPlaceFields } from './group-edits';

describe('correction ciblée d’un lieu signalé', () => {
  it('ne transmet que le texte modifié, sans normaliser les champs inchangés', () => {
    const initial = {name:'Lieu enregistré',description:'À corriger',category:'toilet',
      access:'unknown',website:'https://exemple.fr',city:'Lyon',age:'2–6 ans',
      free:false,wheelchair:null,transit_lines:['A','B'],lat:45.75,lon:4.83};
    const values = structuredClone(initial);
    values.description = 'Corrigé';
    expect(changedPlaceFields(initial, values)).toEqual({description:'Corrigé'});
    expect(initial.description).toBe('À corriger');
  });
  it('conserve les effacements explicites et les changements de oui vers non ou inconnu', () => {
    expect(changedPlaceFields({description:'Texte',wheelchair:true,free:true},
      {description:'',wheelchair:false,free:null})).toEqual({description:'',wheelchair:false,free:null});
  });
  it('transmet une liste modifiée et un déplacement réel, sans arrondi parasite', () => {
    expect(changedPlaceFields({lat:45,lon:5,transit_lines:['A']},
      {lat:45 + 1e-12,lon:5.001,transit_lines:['A','B']})).toEqual({lon:5.001,transit_lines:['A','B']});
  });
});
