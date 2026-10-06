export function nickname(value:string) {
 const name=value.normalize('NFC').trim().replace(/\s+/g,' ');
 if(!/^[A-Za-zÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿ0-9_. -]{2,40}$/.test(name))throw new Error('Pseudo : 2 à 40 caractères, lettres, chiffres, espaces, points, tirets ou underscores.');
 return {name,key:`u_${name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}`};
}
