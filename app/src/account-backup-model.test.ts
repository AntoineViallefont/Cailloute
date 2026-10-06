import {describe,it,expect} from 'vitest';
import {mergeBackup,backupStats,zeroStats} from './account-backup-model';
const input=(device:string,added=0,edited=0)=>({device,counts:{added,edited},legacy:zeroStats()});
describe('Sauvegarde du compte',()=>{
 it('restaure portrait et points après réinstallation',()=>{
  const first=mergeBackup(undefined,{...input('ancien',2,4),avatar:'data:image/webp;base64,YQ=='});
  const restored=mergeBackup(first,input('nouveau'));
  expect(restored.avatar).toBe(first.avatar);expect(backupStats(restored)).toEqual({added:2,edited:4});
 });
 it('ne double pas les points si la réponse est perdue et la requête rejouée',()=>{
  const a=mergeBackup(undefined,input('a',2,3));expect(backupStats(mergeBackup(a,input('a',2,3)))).toEqual({added:2,edited:3});
 });
 it('cumule les contributions de deux appareils sans perdre les opérations simultanées',()=>{
  const a=mergeBackup(undefined,input('a',1,2));const b=mergeBackup(a,input('b',2,1));
  expect(backupStats(mergeBackup(b,input('a',2,3)))).toEqual({added:4,edited:4});
 });
 it('conserve les compteurs historiques sans importer deux fois la même base',()=>{
  const historical={added:8,edited:7};const a=mergeBackup(undefined,{...input('a'),legacy:historical});
  expect(backupStats(mergeBackup(a,{...input('b'),legacy:historical}))).toEqual(historical);
 });
 it('une ancienne photo locale ne ressuscite pas une suppression sauvegardée',()=>{
  const a=mergeBackup(undefined,{...input('a'),avatar:'data:image/webp;base64,YQ=='});
  const removed=mergeBackup(a,{...input('a'),avatar:null});
  expect(mergeBackup(removed,{...input('b'),initialAvatar:a.avatar}).avatar).toBeNull();
 });
});
