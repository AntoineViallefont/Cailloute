import {rm,readdir,rename} from 'node:fs/promises';
const root=new URL('../android/app/src/main/assets/public/',import.meta.url);
await rm(new URL('transit-france/',root),{recursive:true,force:true,maxRetries:5,retryDelay:100});
await rm(new URL('place-groups.json',root),{force:true});
for(const file of ['seed.json','catalog-017.json','catalog-health-015.json','catalog-toilets-017.json','catalog-family-017.json'])await rm(new URL(file,root),{force:true});
console.log('Lieux France/Corse embarqués ; tracés de transport à la demande et conservés localement.');

// AAPT transforme automatiquement les assets .gz. Garder les octets compressés sous .bin.
const canonical=new URL('canonical/',root);
for(const file of await readdir(canonical))if(file.endsWith('.gz'))await rename(new URL(file,canonical),new URL(file.replace(/\.gz$/,'.bin'),canonical));
