import {defaults,type Filters,allPrices} from './geo';
import {categories,transitLabels,LYON,type Origin} from './types';
import {ageBands} from './playground-age';
export function stored<T>(key:string,fallback:T):T {
 try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}
}
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function normalizeFilters(value:unknown,fallback:Filters=defaults):Filters {
 const input=record(value),result={...fallback};
 for(const key of ['changing','open','pmr','publicToilets','organic','recentlyValidated','withPhotos','unknownTransit','includeUnknownAge'] as const)
  if(typeof input[key]==='boolean')result[key]=input[key];
 const choices={categories:Object.keys(categories),transitModes:Object.keys(transitLabels),healthTypes:['doctor','pharmacy','emergency'],prices:allPrices};
 for(const key of Object.keys(choices) as (keyof typeof choices)[]) {
  const value=input[key];
  if(Array.isArray(value))Object.assign(result,{[key]:[...new Set(value.filter(v=>typeof v==='string'&&choices[key].includes(v as never)))]});
 }
 if(typeof input.radius==='number'&&Number.isFinite(input.radius))result.radius=Math.min(50000,Math.max(100,input.radius));
 if(typeof input.minRating==='number'&&Number.isFinite(input.minRating))result.minRating=Math.min(5,Math.max(0,input.minRating));
 if(input.childAge===null || typeof input.childAge==='number'&&Number.isFinite(input.childAge)&&input.childAge>=0&&input.childAge<=18)result.childAge=input.childAge;
 if(input.ageBand===null || typeof input.ageBand==='string'&&ageBands.some(b=>b.value===input.ageBand))result.ageBand=input.ageBand;
 if(typeof input.price==='string'&&['all',...allPrices].includes(input.price))result.price=input.price as Filters['price'];
 return result;
}
export function storedFilters(key:string,fallback:Filters):Filters {return normalizeFilters(stored(key,fallback),fallback);}
export function storedOrigin():Origin {
 const value=record(stored('origin',LYON));
 if(typeof value.lat!=='number'||!Number.isFinite(value.lat)||Math.abs(value.lat)>90||typeof value.lon!=='number'||!Number.isFinite(value.lon)||Math.abs(value.lon)>180)return LYON;
 return {lat:value.lat,lon:value.lon,chosen:value.chosen===true,label:typeof value.label==='string'?value.label:LYON.label};
}
