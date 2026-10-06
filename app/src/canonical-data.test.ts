import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from 'node:zlib';
import {canonicalDetail,migrateCanonicalPlace,sourcePatch,enrichCanonicalSources,type CanonicalGroup} from "./canonical-data";
import {registerOpenEnrichment} from './open-enrichment';
import type {Place,Detail} from "./types";
const p=(id:string,patch:Partial<Place>={}):Place=>({id,name:"Aire de jeux",category:"playground",version:1,lat:45,lon:5,address:"",city:"",hours:"",description:"",age:"",access:"public",sources:[],rating:null,review_count:0,wheelchair:null,changing_table:null,drinking_water:null,free:null,fenced:null,elevator:null,...patch});
describe("fiches fusionnées avant livraison",()=>{
 it("complète la fiche depuis un alias enrichi sans remplacer ses informations ou les conflits",()=>{
  const source=p('qa-alias-enriched');registerOpenEnrichment({[source.id]:{approved:true,baseVersion:1,expected:{hours:'',wheelchair:null,description:''},patch:{hours:'Mo-Fr 10:00-18:00',wheelchair:true,description:'Musée'},sources:[]}});
  const root=p('qa-root-enriched',{description:'Correction conservée',catalog_sources:['qa-root-enriched',source.id],merged_conflicts:['wheelchair']});
  const enriched=enrichCanonicalSources(root,[source]);expect(enriched.hours).toBe('Mo-Fr 10:00-18:00');expect(enriched.description).toBe(root.description);expect(enriched.wheelchair).toBeNull();
  expect(enrichCanonicalSources(root,[source],new Set(['hours'])).hours).toBe('');
  expect(enrichCanonicalSources({...root,community:true},[source]).hours).toBe('');
 });
 it("livre une fiche unique sans membres à recalculer pour chaque groupe",()=>{
  const data=JSON.parse(readFileSync(new URL("../public/canonical-places.json",import.meta.url),"utf8"));
  const ids=new Set<string>();
  const files=data.tiles?.map((t:{file:string})=>t.file)||[null];
  for(const file of files){
   const raw=file?readFileSync(new URL(`../public/canonical/${file}`,import.meta.url)):undefined;
   const groups=file?JSON.parse((file.endsWith('.gz')?gunzipSync(raw!):raw!).toString('utf8')).groups:data.groups;
   for(const g of groups){
    if(g.place.merged_members||g.place.id!==g.id||g.place.catalog_sources.slice().sort().join()!==g.originals.map((p:Place)=>p.id).sort().join())throw Error('Fiche fusionnée incohérente');
    for(const p of g.originals){if(ids.has(p.id))throw Error('Source fusionnée deux fois');ids.add(p.id);}
   }
  }
  const registry=JSON.parse(readFileSync(new URL("../public/place-groups.json",import.meta.url),"utf8"));
  expect([...ids].sort()).toEqual(Object.keys(registry.members).sort());
 },20000);
 it("préserve les corrections et les informations complémentaires déjà fusionnées",()=>{
  const group:CanonicalGroup={id:"a",place:p("a",{description:"Balançoire\n\nToboggan",catalog_sources:["a","b"]}),originals:[p("a",{description:"Balançoire"}),p("b",{description:"Toboggan"})]};
  const result=migrateCanonicalPlace(group,[group.originals[0],p("b",{description:"Toboggan",wheelchair:true})]);
  expect(result.description).toBe("Balançoire\n\nToboggan");expect(result.wheelchair).toBe(true);expect(result.merged_members).toBeUndefined();
 });
 it("conserve les avis de deux sources même quand leurs identifiants sont identiques",()=>{
  const d=(id:string):Detail=>({...p(id),photos:[{id:`photo-${id}`,url:"data:image/jpeg;base64,eA=="} as any],reviews:[{id:"user",stars:4} as any]});
  const result=canonicalDetail(p("a"),[d("a"),d("b")]);
  expect(result.photos).toHaveLength(2);expect(result.reviews).toHaveLength(2);
  expect(result.reviews.map(r=>r.place_id)).toEqual(["a","b"]);
  expect(canonicalDetail(p("a"),[result,d("b")]).reviews).toHaveLength(2);
 });
 it("ignore les métadonnées d’une synchronisation sans changer la fiche fusionnée",()=>{
  expect(sourcePatch(p("a"),p("a",{version:99,community:true,sources:[],review_count:3}))).toEqual({});
 });
});
