import type { ContributionStats } from './contribution-score';
export type Stats = ContributionStats;
export interface AccountBackup { version: 1; legacy: Stats; devices: Record<string, Stats>; avatar: string | null; device: string }
export interface BackupInput { device: string; counts: Stats; legacy: Stats; avatar?: string | null; initialAvatar?: string | null }
export const zeroStats = (): Stats => ({added:0,edited:0});
export function cleanStats(value: any): Stats { return {added:Math.max(0,Math.min(1000000,Math.floor(Number(value?.added)||0))),edited:Math.max(0,Math.min(1000000,Math.floor(Number(value?.edited)||0)))}; }
export function maxStats(a: Stats,b: Stats): Stats {return {added:Math.max(a.added,b.added),edited:Math.max(a.edited,b.edited)};}
export function plusStats(a: Stats,b: Stats): Stats {return {added:a.added+b.added,edited:a.edited+b.edited};}
export function statsDelta(a: Stats,b: Stats): Stats {return {added:Math.max(0,a.added-b.added),edited:Math.max(0,a.edited-b.edited)};}
/** Compteurs propres à chaque installation : reprise idempotente et contributions simultanées. */
export function mergeBackup(remote: AccountBackup | undefined, input: BackupInput): AccountBackup {
 const devices={...remote?.devices,[input.device]:maxStats(cleanStats(remote?.devices?.[input.device]),input.counts)};
 if(Object.keys(devices).length>100)throw new Error('Limite de sauvegardes d’appareils atteinte. Contactez l’éditeur.');
 return {version:1,legacy:maxStats(cleanStats(remote?.legacy),input.legacy),devices,device:input.device,avatar:input.avatar!==undefined?input.avatar:remote?remote.avatar:input.initialAvatar||null};
}
export function backupStats(backup: AccountBackup): Stats {return Object.values(backup.devices).reduce((a,b)=>plusStats(a,cleanStats(b)),cleanStats(backup.legacy));}
