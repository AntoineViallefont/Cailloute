import {catalogIndexHash,routeManifestHash} from './catalog-hashes';
import { Capacitor } from '@capacitor/core';
import { offlineMap } from './map-cache';
/** Les lieux sont embarqués sur Android ; seuls les tracés consultés sont téléchargés. */
export function catalogAssetURL(path:string):string {
 if(Capacitor.isNativePlatform()&&path.startsWith('/canonical/'))return path.replace(/\.gz(?=\?|$)/,'.bin');
 return Capacitor.isNativePlatform() && path.startsWith('/transit-france/') ? `https://cailloute-macavi.web.app${path}` : path;
}
let routeHashes:Promise<Record<string,string>>|undefined;
async function routeURL(path:string){
 routeHashes ??= fetchCatalogAsset(`/route-assets.json?v=${routeManifestHash}`).then(r=>{if(!r.ok)throw new Error('Catalogue des tracés indisponible.');return r.json();}).catch(e=>{routeHashes=undefined;throw e;});
 const hash=(await routeHashes)[path];
 return `${catalogAssetURL(path)}${hash?`?v=${hash}`:''}`;
}
const downloads=new Map<string,Promise<Response>>();
export async function fetchCatalogAsset(path:string):Promise<Response> {
 if(Capacitor.isNativePlatform() && !path.startsWith('/transit-france/'))return fetch(catalogAssetURL(path));
 if(path==='/france/index.json')path+=`?v=${catalogIndexHash}`;
 const cache=await caches.open('cailloute-national-assets-v2');
 const url=path.startsWith('/transit-france/')?await routeURL(path):catalogAssetURL(path);
 const cached=await cache.match(url);if(cached)return cached;
 // Reprendre un ancien tracé connu lors de la première migration, uniquement sans empreinte.
 if(!url.includes('?v=')){
  const old=await(await caches.open('cailloute-national-assets-v1')).match(catalogAssetURL(path));
  if(old){await cache.put(url,old.clone());return old;}
 }
 if(offlineMap())throw new Error(path.startsWith('/canonical/')?'Fusion de cette zone non enregistrée sur cet appareil.':'Tracé non enregistré sur cet appareil.');
 const pending=downloads.get(url);if(pending)return (await pending).clone();
 const task=fetch(url,{signal:AbortSignal.timeout(30000)}).then(async response=>{
  if(response.ok)await cache.put(url,response.clone());
  return response;
 }).finally(()=>downloads.delete(url));
 downloads.set(url,task);
 return (await task).clone();
}
