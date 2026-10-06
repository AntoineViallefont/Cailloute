import {describe,it,expect} from 'vitest';
import {createOpenEnrichmentLoader} from './open-enrichment-loader';
const index={schema:1,version:'2026-10-03',tiles:['45_4','42_9']};
describe('Compléments régionaux embarqués',()=>{
 it('charge seulement les régions demandées, une seule fois même en concurrence',async()=>{
  const calls:string[]=[],saved:unknown[]=[];
  const load=createOpenEnrichmentLoader(async path=>{calls.push(path);return path.endsWith('index.json')?index:{};},value=>saved.push(value));
  await Promise.all([load([{lat:45.7,lon:4.8},{lat:45.5,lon:4.4}]),load([{lat:45.4,lon:4.9}])]);
  expect(calls).toEqual(['/enrichment/index.json','/enrichment/45_4.json?v=2026-10-03']);expect(saved).toHaveLength(1);
  await load([{lat:42.6,lon:9.1}]);expect(calls.at(-1)).toContain('42_9.json');
 });
 it('ne charge pas les régions absentes, ni des coordonnées invalides',async()=>{
  const calls:string[]=[];const load=createOpenEnrichmentLoader(async path=>{calls.push(path);return index;});
  await load([{lat:48,lon:2},{lat:NaN,lon:4}]);expect(calls).toEqual(['/enrichment/index.json']);
 });
 it('préserve les lieux disponibles et permet une reprise après un fichier manquant',async()=>{
  let attempts=0;const saved:unknown[]=[];const load=createOpenEnrichmentLoader(async path=>{if(path.endsWith('index.json'))return index;if(++attempts===1)throw Error('Absent');return {};},value=>saved.push(value));
  await load([{lat:45.7,lon:4.8}]);expect(saved).toHaveLength(0);await load([{lat:45.7,lon:4.8}]);expect(saved).toHaveLength(1);
 });
});
