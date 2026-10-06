// Interpréter uniquement une borne explicite ; un texte vague reste inconnu.
export function playgroundAgeRange(raw: string | undefined): {min:number;max:number} | null {
 const text=(raw||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/,/g,'.').replace(/[–—]/g,'-').replace(/[’]/g,"'");
 if(/^(tous? (les )?ages?|tout age)$/.test(text))return {min:0,max:Infinity};
 const n='(\\d+(?:\\.\\d+)?)';let match:RegExpMatchArray|null;
 const years=(s:string)=>/mois/.test(text)?Number(s)/12:Number(s);
 const clean=text.replace(/\s*(ans?|annees?|mois)\s*/g,' ').trim();
 if((match=clean.match(new RegExp('^(?:de )?'+n+'\\s*(?:-|a|to)\\s*'+n+'$')))){
  const min=years(match[1]),max=years(match[2]);return min<=max?{min,max}:null;
 }
 if((match=clean.match(new RegExp("^(?:a partir de |des |minimum |min[=: ]*|>=?\\s*)"+n+'$')))|| (match=clean.match(new RegExp('^'+n+'\\s*\\+$'))))return {min:years(match[1]),max:Infinity};
 if((match=clean.match(new RegExp("^(?:jusqu'a |jusqua |maximum |max[=: ]*|<=?\\s*)"+n+'$'))))return {min:0,max:years(match[1])};
 if((match=clean.match(new RegExp('^'+n+'$'))))return {min:years(match[1]),max:years(match[1])};
 return null;
}
export function matchesChildAge(raw: string | undefined,age?:number|null,includeUnknown=false):boolean {
 if(age==null)return true;
 if(!Number.isFinite(age)||age<0)return false;
 const range=playgroundAgeRange(raw);
 return range?age>=range.min&&age<=range.max:includeUnknown;
}

export const ageBands = [
 {value:"0-2",label:"0–2 ans",min:0,max:3},
 {value:"3-5",label:"3–5 ans",min:3,max:6},
 {value:"6-8",label:"6–8 ans",min:6,max:9},
 {value:"9-12",label:"9–12 ans",min:9,max:12},
] as const;
export function ageBandForAge(age?:number|null): string | null {
 if(age==null || age<0 || age>12)return null;
 return ageBands.find(b=>age>=b.min && (age<b.max || b.max===12))?.value || null;
}
// Le lieu convient à au moins un âge de la tranche choisie, sans inventer les âges inconnus.
export function matchesAgeBand(raw:string|undefined,band?:string|null,includeUnknown=false):boolean {
 if(!band)return true;
 const chosen=ageBands.find(b=>b.value===band);if(!chosen)return false;
 const range=playgroundAgeRange(raw);if(!range)return includeUnknown;
 return range.max>=chosen.min && (chosen.max===12 ? range.min<=12 : range.min<chosen.max);
}
