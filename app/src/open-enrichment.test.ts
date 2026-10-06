import {describe,it,expect} from 'vitest';
import {enrichOpenImported,type OpenEnrichment} from './open-enrichment';
import {applyPersonal,personalDetail} from './personal';
import {photoCredit} from './photo-credit';
import seed from '../public/seed.json';
import type {Detail,Place} from './types';
const place={...seed[0],website:'',wheelchair:null,version:1} as Place;
const source={key:'wikidata:Q1',name:'Wikidata',url:'https://www.wikidata.org/wiki/Q1',license:'CC0',retrieved_at:'2026-10-03'};
const extra:OpenEnrichment={approved:true,baseVersion:1,expected:{website:'',wheelchair:null},patch:{website:'https://example.org/',wheelchair:false},sources:[source]};
const enrich=(p:Place,e=extra)=>enrichOpenImported(p,{[p.id]:e});
describe('Enrichissement ouvert',()=>{
 it('ne change rien tant que le lot n’est pas approuvé',()=>{expect(enrichOpenImported(place)).toBe(place);expect(enrich(place,{...extra,approved:false} as unknown as OpenEnrichment)).toBe(place);});
 it('complète une inconnue et conserve false comme information explicite',()=>{const result=enrich(place);expect(result.website).toBe('https://example.org/');expect(result.wheelchair).toBe(false);expect(place.website).toBe('');expect(result.sources).toContainEqual(source);});
 it('conserve les données renseignées, les versions modifiées et les suppressions',()=>{
  const stated={...place,website:'https://local.example/',wheelchair:false};expect(enrich(stated)).toBe(stated);
  for(const state of [{version:2},{version:5},{personal_edited:true},{community:true},{deleted:true},{withdrawn:true},{redirect:'elsewhere'}]){const p={...place,...state};expect(enrich(p)).toBe(p);}
 });
 it('applique les corrections personnelles après le complément, y compris une suppression explicite',()=>{
  const base=enrich(place);const changed=applyPersonal(base,undefined,{id:'edit',kind:'place.edit',place_id:place.id,payload:{...base,website:'',wheelchair:null}});
  const result=personalDetail({...base,photos:[],reviews:[]} as Detail,changed);expect(result.website).toBe('');expect(result.wheelchair).toBeNull();
 });
 it('remplace uniquement le texte générique du catalogue touristique',()=>{
  const description='Vérifiez auprès du lieu les âges, horaires et conditions d’accès.';
  const patch:OpenEnrichment={...extra,expected:{description},patch:{description:'Parc public avec jardin botanique.'}};
  expect(enrich({...place,description},patch).description).toBe('Parc public avec jardin botanique.');
  const edited={...place,description:'Texte corrigé'};expect(enrich(edited,patch)).toBe(edited);
 });
 it('rejette les champs non déclarés et les valeurs du mauvais type',()=>{
  for(const proposed of ['javascript:alert(1)',false,'data:text/html,content'])expect(enrich(place,{...extra,patch:{website:proposed} as OpenEnrichment['patch']})).toBe(place);
  expect(enrich(place,{...extra,expected:{},patch:{website:'https://example.org/'}})).toBe(place);
  expect(enrich(place,{...extra,patch:{wheelchair:'yes'} as unknown as OpenEnrichment['patch']})).toBe(place);
 });
});
describe('Crédits des photos libres',()=>{
 it('conserve auteur et licence avec une photo sans ouvrir de lien arbitraire',()=>{const result=photoCredit('@commons:19421850|CC BY-SA 3.0|Florian Fèvre');expect(result?.author).toBe('Florian Fèvre');expect(result?.url).toBe('https://commons.wikimedia.org/?curid=19421850');expect(result?.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/3.0/');});
 it('rejette les crédits incomplets et les licences non libres',()=>{for(const text of ['', 'Légende existante','@commons:4|CC BY-NC 4.0|Auteur','@commons:javascript:alert(1)|CC0|Auteur','@commons:4|CC0|'])expect(photoCredit(text)).toBeNull();});
});
