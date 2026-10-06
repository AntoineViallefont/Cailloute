import { expandedFace, type PhotoMask } from "./photo-masks";
import { suppressDuplicateHeads, type HeadBox } from "./head-detection";
// YuNet : BGR 0..255 ; centres/grandeurs exprimés relativement aux pas 8, 16 et 32.
export function decodeFaces(outputs: Record<string, {data: unknown}>, area: PhotoMask, size = 640): HeadBox[] {
  const faces: HeadBox[] = [];
  for (const stride of [8,16,32]) {
    const cls=outputs[`cls_${stride}`]?.data, obj=outputs[`obj_${stride}`]?.data, box=outputs[`bbox_${stride}`]?.data;
    const columns=size/stride;
    if(!(cls instanceof Float32Array) || !(obj instanceof Float32Array) || !(box instanceof Float32Array) || cls.length!==columns*columns || obj.length!==cls.length || box.length!==cls.length*4) throw new Error("Résultat de détection inattendu.");
    for(let i=0;i<cls.length;i++) {
      const score=Math.sqrt(Math.max(0,Math.min(1,cls[i]))*Math.max(0,Math.min(1,obj[i])));
      if(!Number.isFinite(score)||score<0.6)continue;
      const width=Math.exp(box[i*4+2])*stride/size*area.width,height=Math.exp(box[i*4+3])*stride/size*area.height;
      const x=area.x+((i%columns)+box[i*4])*stride/size*area.width-width/2;
      const y=area.y+(Math.floor(i/columns)+box[i*4+1])*stride/size*area.height-height/2;
      if([x,y,width,height].every(Number.isFinite)&&width>0&&height>0) faces.push({x,y,width,height,score});
    }
  }
  return suppressDuplicateHeads(faces);
}
export function faceMasks(faces: HeadBox[]): PhotoMask[] {
  return suppressDuplicateHeads(faces).map(expandedFace).filter((m): m is PhotoMask => !!m);
}
