import {it,expect} from "vitest";
import { weatherAdvice } from "./weather-advice";
import type {WeatherData} from "./weather-client";
it("n'invente pas un temps favorable en absence de mesure",()=>{
 expect(weatherAdvice(null).join()).toContain("indisponible");
 expect(weatherAdvice({temperature:null,code:null} as WeatherData).join()).toContain("partielles");
});
it("adapte simultanément les conseils aux conditions observées",()=>{
 const tips=weatherAdvice({temperature:31,code:95,wind:60,uv:7,rain_mm:2,aqi:70} as WeatherData).join();
 for(const word of ["Orage","Chaleur","Vent","UV","Pluie","Air"])expect(tips).toContain(word);
});

it("évite le parapluie sous vent fort et propose une protection solaire",()=>{
 const tips=weatherAdvice({temperature:8,code:61,wind:45,uv:4,rain_mm:1} as WeatherData).join();
 expect(tips).toContain("imperméable");expect(tips).not.toContain("parapluie");
 expect(tips).toContain("chaudement");expect(tips).toContain("crème solaire");
});

it("adapte l’horaire à la France et ne confond pas température et canicule",()=>{
 const d={temperature:29,code:0,wind:0,uv:4,aqi:15} as WeatherData;
 expect(weatherAdvice(d,new Date('2026-07-01T11:00:00Z')).join()).toContain('12–16 h');
 expect(weatherAdvice(d,new Date('2026-07-01T08:00:00Z')).join()).toContain('avant midi');
 expect(weatherAdvice(d).join()).not.toContain('canicule');expect(weatherAdvice(d).join()).toContain('allaité');
});
it("les conseils air suivent l’indice européen et les efforts de l’enfant",()=>{
 for(const [aqi,text] of [[41,'Air moyen'],[61,'Air dégradé'],[81,'Air très dégradé']] as const)expect(weatherAdvice({temperature:20,code:0,aqi} as WeatherData).join()).toContain(text);
 expect(weatherAdvice({temperature:20,code:0,uv:2} as WeatherData).join()).not.toContain('SPF');
});
it('16 °C et nuages : veste, sans ombre générique ; les UV restent prioritaires si mesurés',()=>{
 const d={temperature:16,code:3,wind:10,uv:1,aqi:15} as WeatherData;
 expect(weatherAdvice(d).join()).toContain('petite veste');expect(weatherAdvice(d).join()).not.toContain('ombre');
 expect(weatherAdvice({...d,uv:4}).join()).toContain('UV');
 expect(weatherAdvice({temperature:22,code:3,wind:5,uv:1,aqi:15} as WeatherData).join()).not.toContain('ombre');
});
const solar=[{date:'2026-10-03',sunrise:'2026-10-03T05:45:00Z',sunset:'2026-10-03T17:10:00Z'}];
it('bascule au coucher du soleil et retire les conseils UV même si leur valeur est encore en cache',()=>{
 const d={temperature:16,code:3,uv:4,solar_days:solar} as WeatherData;
 expect(weatherAdvice(d,new Date('2026-10-03T17:09:59Z')).join()).toContain('petite veste');
 const tips=weatherAdvice(d,new Date('2026-10-03T17:10:00Z')).join();
 expect(tips).toContain('parcours éclairé');for(const word of ['UV','SPF','soleil','ombre'])expect(tips).not.toContain(word);
});
it('conserve les risques de nuit et ne propose pas de promenade pendant un orage',()=>{
 const tips=weatherAdvice({temperature:29,code:95,wind:60,rain_mm:2,aqi:85,uv:7,solar_days:solar} as WeatherData,new Date('2026-10-03T21:00:00Z')).join();
 for(const word of ['Orage','Chaleur','Pluie','Vent','Air'])expect(tips).toContain(word);
 for(const word of ['promenade','ombre','UV'])expect(tips).not.toContain(word);
});
it('nuit douce : promenade calme et parcours éclairé ; retour aux conseils de jour au lever',()=>{
 const d={temperature:22,code:0,uv:4,solar_days:solar} as WeatherData;
 expect(weatherAdvice(d,new Date('2026-10-03T05:44:59Z')).join()).toContain('promenade calme');
 const day=weatherAdvice(d,new Date('2026-10-03T05:45:00Z')).join();
 expect(day).toContain('UV');expect(day).not.toContain('éclairé');
});
it('ne conseille pas un parcours extérieur par nuit fraîche orageuse',()=>{
 const tips=weatherAdvice({temperature:16,code:95,solar_days:solar} as WeatherData,new Date('2026-10-03T21:00:00Z')).join();
 expect(tips).toContain('Orage');expect(tips).not.toContain('parcours');
});
