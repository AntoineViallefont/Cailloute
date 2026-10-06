const metres=(a,b)=>{
 const rad=Math.PI/180, dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
};
const protectedPlace=p=>p.community||p.id.startsWith('c_')||p.personal_edited||!!p.verified_by;
const identityURL=value=>{try{const u=new URL(value);if(u.hostname.replace(/^www\./,'')!=='ugc.fr'||u.pathname!=='/cinema.html'||!/^\d+$/.test(u.searchParams.get('id')||''))return '';return 'ugc:'+u.searchParams.get('id');}catch{return '';}};
/** Une position sourcée est conservée ; aucune moyenne n'est imposée aux fusions validées. */
export function verifiedPlaceCorrection(rule,places){
 const preferred=rule.preferredPosition;
 const source=preferred&&places.find(p=>p.id===preferred.id||(p.sources||[]).some(s=>s.key===preferred.sourceKey));
 if(preferred&&!source)throw Error('Emplacement sélectionné absent : '+preferred.id);
 return {...(source?{lat:source.lat,lon:source.lon,location_kind:source.location_kind}:{}),...rule.patch};
}
/** Les rapprochements à plus de 20 m exigent une preuve dédiée et une borne géographique. */
export function applyVerifiedMerges(rows,members,verified){
 const result={...members}, corrections=new Map();
 const groups=new Map();
 for(const p of rows){const root=members[p.id]?.id||p.id;if(!groups.has(root))groups.set(root,[]);groups.get(root).push(p);}
 for(const rule of verified){
  const known=new Set(rule.members), keys=new Set(rule.sourceKeys), identity=identityURL(rule.website);
  const matches=rows.filter(p=>!protectedPlace(p)&&p.category==='child_activity'&&/cin[eé]ma/i.test(p.activity_type||'')&&(known.has(p.id)||(p.sources||[]).some(s=>keys.has(s.key))||(rule.matchFutureWebsite&&identity&&identityURL(p.website)===identity)));
  const roots=[...new Set(matches.map(p=>members[p.id]?.id||p.id))];
  const expanded=roots.flatMap(id=>groups.get(id)||[]);
  if(expanded.length<2||expanded.some(protectedPlace)||expanded.some(p=>p.category!=='child_activity'||!/cin[eé]ma/i.test(p.activity_type||'')))continue;
  // Aucune chaîne ne permet de franchir la distance maximale de la preuve.
  if(expanded.some(a=>expanded.some(b=>metres(a,b)>rule.maxDistance)))continue;
  const id=roots.sort()[0];
  for(const p of expanded)result[p.id]={id,kind:'nearby'};
  corrections.set(id,verifiedPlaceCorrection(rule,expanded));
 }
 return {members:result,corrections};
}
