import { describe, it, expect } from "vitest";
import { groupPlaces } from "./group-places";
import { groupCatalogPlaces } from "./catalog-groups";
import { mergeInitialGroups } from "./catalog-migration";
import { compatiblePlaceIdentity } from "./place-match";
import type { Place } from "./types";
const p=(id:string,name:string,patch:Partial<Place>={}):Place=>({id,name,category:"playground",lat:45.7578,lon:4.832,address:"",city:"Lyon",hours:"",description:"",age:"",access:"public",sources:[],version:1,rating:null,review_count:0,wheelchair:null,changing_table:null,drinking_water:null,free:null,fenced:null,elevator:null,...patch});
describe("identité des lieux et stabilité du catalogue",()=>{
 it("tolère préfixes, accents, ordre des mots et fautes limitées",()=>{
  const a=p("a","Aire de jeux Jean-Jaurès");
  for(const name of ["Square Jean Jaures","Jaurès Jean","Parc Jean Jauress"]) expect(compatiblePlaceIdentity(a,p("b",name))).toBe(true);
 });
 it("réunit les équipements génériques d’une même aire à 60 mètres",()=>{
  expect(groupPlaces([p("a","Aire de jeux"),p("b","Aire de jeux",{lon:4.8328})])).toHaveLength(1);
 });
 it("accepte une adresse précise pour compléter un nom générique",()=>{
  expect(compatiblePlaceIdentity(p("a","Aire de jeux",{address:"12 rue des Lilas"}),p("b","Square des Lilas",{address:"12 rue des Lilas"}))).toBe(true);
 });
 it("rejette les adresses, numéros, directions et noms distincts",()=>{
  for(const [a,b] of [["Square Jean Jaurès Nord","Square Jean Jaurès Sud"],["Jeux des petits","Jeux des grands"],["Square 12","Square 13"],["Square Jean Jaurès","Square Jean Moulin"]]) expect(compatiblePlaceIdentity(p("a",a),p("b",b,{lon:4.833}))).toBe(false);
  expect(compatiblePlaceIdentity(p("a","Jean Jaurès",{address:"12 rue des Lilas"}),p("b","Jean Jaurès",{address:"14 rue des Lilas"}))).toBe(true);
 });
 it("ne divise pas un groupe après correction de nom, position ou catégorie",()=>{
  const a=p("a","Aire de jeux Jean Jaures",{catalog_group:{id:"a",kind:"nearby"}});
  const b=p("b","Nom corrigé",{lat:45.76,category:"child_activity",catalog_group:{id:"a",kind:"nearby"}});
  const result=groupCatalogPlaces([b,a]);
  expect(result).toHaveLength(1);expect(result[0].id).toBe("a");
  expect(result[0].merged_members?.map(p=>p.id)).toEqual(["a","b"]);
  expect(groupCatalogPlaces([b])[0].id).toBe("b");
 });
 it("préserve les contributions et tous les IDs sources",()=>{
  const source=p("a","Square",{catalog_group:{id:"a"}});
  const own=p("c_a","Square",{community:true,catalog_group:{id:"a"}});
  expect(groupCatalogPlaces([source,own]).map(p=>p.id)).toEqual(["c_a","a"]);
 });
});

describe("migration explicite de la base initiale",()=>{
 it("fusionne les anciennes séparations sans perdre les sources, puis reste stable",()=>{
  const places=[p("a","Aire de jeux"),p("b","Square",{lon:4.8328}),p("c_nouveau","Square",{community:true})];
  const previous={a:{id:"a"},b:{id:"b"},absent:{id:"b"},c_nouveau:{id:"c_nouveau"}};
  const next=mergeInitialGroups(places,previous);
  expect(next.a.id).toBe(next.b.id);expect(next.absent.id).toBe(next.b.id);
  expect(next.c_nouveau.id).toBe("c_nouveau");
  expect(Object.keys(next).sort()).toEqual(Object.keys(previous).sort());
  expect(mergeInitialGroups(places,next)).toEqual(next);
  expect(previous.b.id).toBe("b");
 });
 it("interdit les chaînes et conserve les anciens groupes indivisibles",()=>{
  const places=[p("a","Square"),p("b","Square",{lon:4.8328}),p("c","Square",{lon:4.8336})];
  const next=mergeInitialGroups(places,{a:{id:"a"},b:{id:"b"},c:{id:"c"}});
  expect(new Set(Object.values(next).map(g=>g.id)).size).toBe(2);
  const old={a:{id:"a"},b:{id:"a"},c:{id:"c"}};
  expect(mergeInitialGroups(places,old)).toEqual(old);
 });
 it("concatène les descriptions et signale les équipements contradictoires",()=>{
  const grouped=groupPlaces([p("a","Square",{description:"Balançoire",wheelchair:true}),p("b","Aire de jeux",{description:"Toboggan",wheelchair:false,lon:4.8324})]);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].description).toBe("Balançoire\n\nToboggan");
  expect(grouped[0].merged_conflicts).toContain("wheelchair");
 });
});

it("migre les groupes établis de noms différents sous 20 m et garde les aliases",()=>{
 const places=[p("a","Musée municipal",{category:"child_activity"}),p("b","Musée de la ville",{category:"child_activity",lon:4.8321})];
 const next=mergeInitialGroups(places,{a:{id:"a"},b:{id:"b"},alias:{id:"b"}});
 expect(next.b.id).toBe(next.a.id);expect(next.alias.id).toBe(next.a.id);
 expect(mergeInitialGroups(places,next)).toEqual(next);
});
