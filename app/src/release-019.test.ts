import { describe,it,expect } from "vitest";
import { inFrance } from "./france";
import { defaults,matches } from "./geo";
import { websiteUrl } from "./place-rules";
import { contributionScore } from "./contribution-score";
import { LYON,type Place } from "./types";
describe("France, tarifs et confidentialité",()=>{
  it("accepte un domaine sans préfixe et refuse les schémas dangereux",()=>{
    expect(websiteUrl("exemple.fr/test")).toBe("https://exemple.fr/test");
    expect(websiteUrl("www.exemple.fr")).toBe("https://www.exemple.fr/");
    for(const v of ["javascript:alert(1)","data:text/html,x","https://user:pass@exemple.fr","pas un site","localhost"])expect(websiteUrl(v)).toBeNull();
  });
  it("distingue gratuit payant et inconnu",()=>{
    const base={id:"test",category:"toilet",lat:LYON.lat,lon:LYON.lon,review_count:0} as Place;
    for(const free of [true,false,null])for(const price of ["all","free","paid","unknown"] as const)
      expect(matches({...base,free},{...defaults,price},LYON)).toBe(price==="all"||(price==="free"&&free===true)||(price==="paid"&&free===false)||(price==="unknown"&&free===null));
  });
  it("inclut Paris et la Corse et exclut les pays voisins",()=>{
    for(const p of [{lat:48.8566,lon:2.3522},{lat:41.9192,lon:8.7386},LYON])expect(inFrance(p)).toBe(true);
    expect(inFrance({lat:46.2044,lon:6.1432})).toBe(false);
    expect(inFrance({lat:51.507,lon:-.127})).toBe(false);
  });
  it("calcule les récompenses à partir des seuls compteurs",()=>{
    expect(contributionScore({added:3,edited:0})).toMatchObject({points:30,level:"Parent éclaireur"});
    expect(contributionScore({added:0,edited:10})).toMatchObject({points:30,badges:["Œil attentif"]});
  });
});
