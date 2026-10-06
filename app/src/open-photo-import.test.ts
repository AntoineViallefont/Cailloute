import {describe,it,expect} from 'vitest';
import {readOpenPhotoPlan,importOpenPhotos,type OpenPhotoPlan} from './open-photo-import';
import type {FreeSession} from './free-cloud';
// Petit conteneur utilisé seulement par les contrôles du manifeste ; le décodage réel est testé dans le navigateur.
const bytes='RIFF'+String.fromCharCode(12,0,0,0)+'WEBPVP8 '+String.fromCharCode(0,0,0,0);
const plan:OpenPhotoPlan={schema:1,approved:true,approvedAt:'2026-10-03T12:00:00Z',candidates:[{place:{id:'p_1'},photo:{url:'data:image/webp;base64,'+btoa(bytes),caption:'@commons:19421850|CC BY-SA 3.0|Florian Fèvre',privacyReviewed:true,sourceUrl:'https://commons.wikimedia.org/wiki/File:Station.jpg',author:'Florian Fèvre',license:'CC BY-SA 3.0'}}]};
const admin:FreeSession={uid:'admin',isAdmin:true,email:'admin@example.org',displayName:'Admin',verified:true,termsAccepted:true,blocked:false};
describe('Import de photos ouvertes',()=>{
 it('n’importe aucune photo sans validation explicite du lot et du floutage',()=>{expect(()=>readOpenPhotoPlan({...plan,approved:false})).toThrow();expect(()=>readOpenPhotoPlan({...plan,candidates:[{...plan.candidates[0],photo:{...plan.candidates[0].photo,privacyReviewed:false}}]})).toThrow();});
 it('vérifie les 40 000 octets réels et la signature WebP',()=>{
  const edit=(url:string)=>({...plan,candidates:[{...plan.candidates[0],photo:{...plan.candidates[0].photo,url}}]});
  expect(()=>readOpenPhotoPlan(edit('data:image/webp;base64,'+btoa(bytes+'x'.repeat(40000))))).toThrow();expect(()=>readOpenPhotoPlan(edit('data:image/jpeg;base64,'+btoa(bytes)))).toThrow();expect(()=>readOpenPhotoPlan(edit('data:image/webp;base64,'+btoa('not an actual webp image')))).toThrow();
 });
 it('rejette les crédits différents, doublons et lots trop volumineux',()=>{expect(()=>readOpenPhotoPlan({...plan,candidates:[{...plan.candidates[0],photo:{...plan.candidates[0].photo,author:'Autre auteur'}}]})).toThrow();expect(()=>readOpenPhotoPlan({...plan,candidates:[...plan.candidates,...plan.candidates]})).toThrow();expect(()=>readOpenPhotoPlan({...plan,candidates:Array(11).fill(plan.candidates[0])})).toThrow();});
 it('n’autorise pas les comptes ordinaires ou restreints et ne fait aucun envoi',async()=>{for(const account of [null,{...admin,isAdmin:false},{...admin,verified:false},{...admin,blocked:true}]){let calls=0;await expect(importOpenPhotos(plan,{account:()=>account,enqueueOnce:async()=>{calls++;return true;},sync:async()=>{calls++;}})).rejects.toThrow();expect(calls).toBe(0);}});
 it('reprend un lot sans doublon et utilise la file habituelle',async()=>{const seen=new Set<string>();let syncs=0;const service={account:()=>admin,enqueueOnce:async(key:string)=>{if(seen.has(key))return false;seen.add(key);return true;},sync:async()=>{syncs++;}};expect(await importOpenPhotos(plan,service)).toEqual({queued:1,skipped:0});expect(await importOpenPhotos(plan,service)).toEqual({queued:0,skipped:1});expect(syncs).toBe(2);});
});
