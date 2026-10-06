/** Dimensions et absence de métadonnées personnelles du fichier final. */
export function webpDimensions(bytes){
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)!==bytes.length-8)throw Error('Conteneur WebP invalide.');
 let dimensions;
 for(let offset=12;offset+8<=bytes.length;){
  const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
  if(start+size>bytes.length)throw Error('WebP tronqué.');
  if(['EXIF','XMP ','ANIM','ANMF'].includes(type))throw Error('Métadonnées personnelles ou animation interdites.');
  if(type==='VP8X'){
   if(size<10||(bytes[start]&14))throw Error('Extension WebP non conforme.');
   dimensions={width:bytes.readUIntLE(start+4,3)+1,height:bytes.readUIntLE(start+7,3)+1};
  }else if(type==='VP8 '){
   if(size<10||bytes.toString('hex',start+3,start+6)!=='9d012a')throw Error('Image WebP invalide.');
   dimensions={width:bytes.readUInt16LE(start+6)&16383,height:bytes.readUInt16LE(start+8)&16383};
  }else if(type==='VP8L'){
   if(size<5||bytes[start]!==47)throw Error('Image WebP invalide.');
   const bits=bytes.readUInt32LE(start+1);dimensions={width:(bits&16383)+1,height:((bits>>>14)&16383)+1};
  }
  offset=start+size+(size%2);
 }
 if(!dimensions||!dimensions.width||!dimensions.height||Math.max(dimensions.width,dimensions.height)>960)throw Error('Photo trop grande : 960 pixels maximum.');
 return dimensions;
}
