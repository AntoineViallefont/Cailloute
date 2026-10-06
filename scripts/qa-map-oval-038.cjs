const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5187/suppression-compte');
 const result=await page.evaluate(async()=>{
  const {mapDB,paintTile,tileKey}=await import('/src/map-cache.ts');localStorage.setItem('map-offline','true');await mapDB.tiles.clear();
  async function blob(color){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,256,256);return new Promise(resolve=>c.toBlob(resolve));}
  const parent={style:'plan',z:11,x:20,y:20},child={style:'plan',z:15,x:336,y:320};
  await mapDB.tiles.bulkPut([{...parent,key:tileKey(parent),blob:await blob('red'),used:0,pinned:1},{...child,key:tileKey(child),blob:await blob('blue'),used:0,pinned:1}]);
  const c=document.createElement('canvas');c.width=c.height=256;const time=performance.now();const painted=await paintTile(c,{style:'plan',z:10,x:10,y:10});const ctx=c.getContext('2d');
  const map={painted,ms:performance.now()-time,red:[...ctx.getImageData(50,50,1,1).data],blue:[...ctx.getImageData(132,4,1,1).data]};
  const {expandedFace,drawPhotoMasks}=await import('/src/photo-masks.ts');const image=document.createElement('canvas');image.width=image.height=400;const ic=image.getContext('2d');
  for(let y=0;y<400;y+=2)for(let x=0;x<400;x+=2){ic.fillStyle=((x+y)/2)%2?'white':'black';ic.fillRect(x,y,2,2);}
  const before=ic.getImageData(0,0,400,400).data;const mask=expandedFace({x:.3,y:.3,width:.2,height:.2});drawPhotoMasks(ic,[mask]);const after=ic.getImageData(0,0,400,400).data;
  function difference(x,y){const i=(y*400+x)*4;return Math.abs(before[i]-after[i]);}
  const oval={center:difference(160,160),originalCorners:[[120,120],[199,120],[120,199],[199,199]].map(([x,y])=>difference(x,y)),outside:difference(90,81)};
  return {map,oval};
 });
 assert.equal(result.map.painted,true);assert.deepEqual(result.map.red,[255,0,0,255]);assert.deepEqual(result.map.blue,[0,0,255,255]);assert(result.oval.center>50);assert(result.oval.originalCorners.every(v=>v>40));assert.equal(result.oval.outside,0);console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
