import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-cailloute-free',firestore:{host:'127.0.0.1',port:8189,rules:readFileSync('../firestore.rules','utf8')}});
const user=uid=>env.authenticatedContext(uid,{email_verified:true,email:`${uid}@example.invalid`}).firestore();
const a=user('backup-alice'),b=user('backup-bob'),anonymous=env.unauthenticatedContext().firestore();
const ref=db=>doc(db,'members','backup-alice','private','profile');
const payload=()=>({version:1,legacy:{added:3,edited:4},devices:{device1:{added:1,edited:2}},device:'device1',avatar:'data:image/webp;base64,YQ==',updated:serverTimestamp()});
let count=0;async function test(name,fn){await fn();console.log(`✓ ${name}`);count++;}
try{
 await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'members','backup-alice'),{name:'Fictif'});});
 await test('création et restauration privées',async()=>{await assertSucceeds(setDoc(ref(a),payload()));const saved=await assertSucceeds(getDoc(ref(a)));if(saved.data().legacy.added!==3)throw Error('Compteur perdu');});
 await test('aucune lecture ni écriture depuis un autre compte',async()=>{await assertFails(getDoc(ref(b)));await assertFails(setDoc(ref(b),payload()));await assertFails(deleteDoc(ref(b)));await assertFails(getDoc(ref(anonymous)));});
 await test('image bornée et format contrôlé',async()=>{await assertFails(setDoc(ref(a),{...payload(),avatar:'data:image/webp;base64,'+'A'.repeat(55000)}));await assertFails(setDoc(ref(a),{...payload(),avatar:'https://example.org/prive.jpg'}));});
 await test('compteurs non négatifs et non décroissants',async()=>{await assertFails(setDoc(ref(a),{...payload(),legacy:{added:-1,edited:4}}));await assertFails(setDoc(ref(a),{...payload(),devices:{device1:{added:0,edited:2}}}));});
 await test('un appareil ne peut effacer le compteur d’un autre',async()=>{const next={...payload(),device:'device2',devices:{device1:{added:1,edited:2},device2:{added:2,edited:0}}};await assertSucceeds(setDoc(ref(a),next));await assertFails(setDoc(ref(a),{...next,devices:{device2:{added:2,edited:0}}}));});
 await test('portrait supprimé et compte supprimé',async()=>{const previous=(await getDoc(ref(a))).data();await assertSucceeds(setDoc(ref(a),{...previous,avatar:null,updated:serverTimestamp()}));await assertSucceeds(deleteDoc(ref(a)));await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'members','backup-alice')));await assertFails(setDoc(ref(a),payload()));});
 console.log(`${count} contrôles de sauvegarde privée réussis.`);
}finally{await env.cleanup();}
