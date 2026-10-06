import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PhotoPrivacyReview} from './PhotoPrivacyReview';
import {PhotoViewer} from './PhotoViewer';
import {preparePhotoCopy,photoDataUrl} from './photo-input';
import type {PrivacyPhoto} from './photo-privacy';
import type {Place,Source} from './types';
import type {EnrichmentField} from './open-enrichment';
import './style.css';
import './open-enrichment-preview.css';
type Candidate={place:Place;patch:Record<EnrichmentField,unknown>;expected:Record<string,unknown>;baseVersion:number;sources:Source[];photo?:{caption:string;author:string;license:string;licenseUrl:string;sourceUrl:string;bytes?:number;finalFile?:string;originalFile:string;masks?:PrivacyPhoto['automatic'];status:string;detectionComplete?:boolean}};
const labels:Record<string,string>={hours:'Horaires',website:'Site web',description:'Description',age:'Âges indiqués',wheelchair:'Accès PMR',changing_table:'Table à langer',free:'Gratuit',organic:'Bio',drinking_water:'Eau potable'};
const value=(v:unknown)=>v===true?'Oui':v===false?'Non':v==null||v===''?'Non renseigné':String(v);
function Preview(){
 const [data,setData]=useState<{candidates:Candidate[];created:string;scope:string;failures:unknown[]}>();
 const [search,setSearch]=useState(''),[onlyPhotos,setOnlyPhotos]=useState(false),[limit,setLimit]=useState(30),[night,setNight]=useState(true);
 const [excluded,setExcluded]=useState(new Set<string>()),[photoExcluded,setPhotoExcluded]=useState(new Set<string>());
 const [copies,setCopies]=useState<Record<string,PrivacyPhoto>>({}),[editing,setEditing]=useState<{candidate:Candidate;photo:PrivacyPhoto}>(),[view,setView]=useState<Candidate>();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[approved,setApproved]=useState(false);
 useEffect(()=>{void fetch('/__open/candidates.json').then(r=>{if(!r.ok)throw new Error('Lot indisponible');return r.json();}).then(setData).catch(e=>setError(e.message));},[]);
 useEffect(()=>{document.documentElement.dataset.theme=night?'dark':'light';document.documentElement.classList.toggle('dark',night);document.documentElement.style.colorScheme=night?'dark':'light';},[night]);
 const all=data?.candidates||[];
 const selected=all.filter(c=>!excluded.has(c.place.id));
 const visible=all.filter(c=>(!onlyPhotos||c.photo?.finalFile)&&`${c.place.name} ${c.place.city} ${c.place.category}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')));
 const photoReady=(c:Candidate)=>!!c.photo?.finalFile&&c.photo.detectionComplete===true&&!photoExcluded.has(c.place.id);
 async function edit(c:Candidate){setBusy(true);setError('');try{
   let photo=copies[c.place.id];
   if(!photo){const original=await(await fetch('/__open/'+c.photo!.originalFile)).blob();const working=await preparePhotoCopy(original,undefined,[],undefined,960,200000);const prepared=await preparePhotoCopy(working.blob,undefined,c.photo!.masks||[]);photo={id:c.place.id,original:working.blob,prepared:prepared.prepared,automatic:c.photo!.masks||[],manual:[],detectionFailed:false,reviewed:false};}
   setEditing({candidate:c,photo});
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function exportPlan(){setBusy(true);setError('');try{
   if(!approved)throw new Error('Validez le lot avant son export.');
   const candidates=await Promise.all(selected.map(async c=>{
    const p=c.photo;let photo;
    if(p&&photoReady(c)){
     const url=copies[c.place.id]?photoDataUrl(copies[c.place.id].prepared.base64):photoDataUrl(btoa(String.fromCharCode(...new Uint8Array(await(await fetch('/__open/'+p.finalFile)).arrayBuffer()))));
     photo={url,caption:p.caption,privacyReviewed:true,sourceUrl:p.sourceUrl,license:p.license,author:p.author};
    }
    return {place:c.place,expected:c.expected,baseVersion:c.baseVersion,patch:c.patch,sources:c.sources,...(photo?{photo}:{})};
   }));
   const bundle={schema:1,approved:true,approvedAt:new Date().toISOString(),sourceBatch:data!.created,candidates};
   const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='enrichissement-valide.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="open-review"><header><div><h1>Enrichissement à valider</h1><p>{all.length} lieux · {all.reduce((n,c)=>n+Object.keys(c.patch).length,0)} champs · {all.filter(photoReady).length} photos prêtes · aucun appel Firebase</p></div><button className="secondary" onClick={()=>setNight(n=>!n)}>{night?'Mode jour':'Mode nuit'}</button></header>
 <p className="notice">Préparation locale. Les champs déjà renseignés restent conservés. Aucun contenu de ce lot n’est publié.</p>
 <div className="review-tools"><input aria-label="Rechercher un lieu" placeholder="Rechercher un lieu, une ville…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(30);}}/><label><input type="checkbox" checked={onlyPhotos} onChange={e=>setOnlyPhotos(e.target.checked)}/>Avec une photo prête</label><button className="secondary" onClick={()=>setExcluded(new Set(all.map(c=>c.place.id)))}>Tout exclure</button><button className="secondary" onClick={()=>setExcluded(new Set())}>Tout sélectionner</button></div>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="review-cards">{visible.slice(0,limit).map(c=><article key={c.place.id} className={excluded.has(c.place.id)?'review-excluded':''}><div className="row"><h2>{c.place.name}</h2><label><input type="checkbox" aria-label={`Inclure ${c.place.name}`} checked={!excluded.has(c.place.id)} onChange={e=>setExcluded(old=>{const next=new Set(old);e.target.checked?next.delete(c.place.id):next.add(c.place.id);return next;})}/>Inclure</label></div><p>{[c.place.address,c.place.city].filter(Boolean).join(' · ')} <small>{c.place.lat.toFixed(5)}, {c.place.lon.toFixed(5)}</small></p>
 <table><thead><tr><th>Champ</th><th>Actuellement</th><th>Proposition</th></tr></thead><tbody>{Object.entries(c.patch).map(([field,v])=><tr key={field}><th>{labels[field]||field}</th><td>{value(c.place[field as keyof Place])}</td><td>{value(v)}</td></tr>)}</tbody></table>
 {c.photo?.finalFile&&<div className="review-photo"><button className="photo-preview" onClick={()=>setView(c)}><img src={copies[c.place.id]?photoDataUrl(copies[c.place.id].prepared.base64):'/__open/'+c.photo.finalFile} alt={`Photo proposée de ${c.place.name}`}/></button><p>WebP · {copies[c.place.id]?atob(copies[c.place.id].prepared.base64).length:c.photo.bytes} octets · {c.photo.masks?.length||0} visage(s) détecté(s)</p><p>© {c.photo.author} · <a href={c.photo.licenseUrl} target="_blank" rel="noreferrer">{c.photo.license}</a> · <a href={c.photo.sourceUrl} target="_blank" rel="noreferrer">Photo d’origine</a></p><div className="row"><button className="secondary" disabled={busy} onClick={()=>void edit(c)}>Vérifier / modifier le floutage</button><label><input type="checkbox" checked={!photoExcluded.has(c.place.id)} onChange={e=>setPhotoExcluded(old=>{const next=new Set(old);e.target.checked?next.delete(c.place.id):next.add(c.place.id);return next;})}/>Inclure la photo</label></div></div>}
 {c.photo?.status==='excluded'&&<p className="notice">Photo exclue : analyse incomplète.</p>}
 <details><summary>Origine des informations</summary>{c.sources.map(s=><p key={s.key}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> · {s.license}</p>)}</details></article>)}</div>
 {visible.length>limit&&<button className="secondary" onClick={()=>setLimit(n=>n+30)}>Afficher 30 lieux supplémentaires</button>}
 <footer><p>{selected.length} lieux sélectionnés · {selected.filter(photoReady).length} photos</p><label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>Je valide ce lot, ses sources et les photos sélectionnées.</label><button className="primary" disabled={!approved||busy||!selected.length} onClick={()=>void exportPlan()}>Exporter le lot validé</button></footer>
 {editing&&<PhotoPrivacyReview photo={editing.photo} editing number={1} total={1} onClose={()=>setEditing(undefined)} onSave={photo=>{setCopies(old=>({...old,[editing.candidate.place.id]:photo}));setEditing(undefined);}}/>}
 {view?.photo&&<PhotoViewer photos={[{url:copies[view.place.id]?photoDataUrl(copies[view.place.id].prepared.base64):'/__open/'+view.photo.finalFile,caption:view.photo.caption}]} placeName={view.place.name} onClose={()=>setView(undefined)}/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
