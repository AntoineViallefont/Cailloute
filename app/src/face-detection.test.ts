import {expect,it} from "vitest";
import {decodeFaces,faceMasks} from "./face-detection";
it("décode les scores et les rectangles YuNet avec une marge de floutage",()=>{
 const outputs:Record<string,{data:Float32Array}>={};
 for(const stride of [8,16,32])for(const key of ['cls','obj','bbox'])outputs[`${key}_${stride}`]={data:new Float32Array((640/stride)**2*(key==='bbox'?4:1))};
 const i=10*80+20;outputs.cls_8.data[i]=0.9;outputs.obj_8.data[i]=0.9;
 outputs.bbox_8.data.set([0.5,0.5,Math.log(4),Math.log(5)],i*4);
 const faces=decodeFaces(outputs,{x:0,y:0,width:1,height:1});expect(faces).toHaveLength(1);
 expect(faces[0].x).toBeCloseTo((20.5*8-16)/640);expect(faces[0].width).toBeCloseTo(32/640);
 const mask=faceMasks(faces)[0];expect(mask.x).toBeLessThan(faces[0].x);expect(mask.width).toBeGreaterThan(faces[0].width);
 expect(()=>decodeFaces({}, {x:0,y:0,width:1,height:1})).toThrow();
});
