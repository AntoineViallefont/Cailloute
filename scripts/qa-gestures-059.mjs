import{createRequire}from'node:module';import{resolve}from'node:path';import{writeFile}from'node:fs/promises';import assert from'node:assert/strict';
const require=createRequire(resolve('app/package.json')),{chromium}=require(resolve(process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const browser=await chromium.launch({channel:'chrome',headless:true});const report={version:'0.1.59',errors:[]};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(u.hostname))return r.abort();if(u.pathname==='/__gesture_qa')return r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><div id="root"></div></body></html>'});return r.continue();});
 await page.goto('http://127.0.0.1:5195/__gesture_qa');
 await page.evaluate(async()=>{
  const Refresh=(await import('/@react-refresh')).default;Refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {usePlaceSheet}=await import('/src/usePlaceSheet.ts'),{Modal}=await import('/src/Modal.tsx'),{PhotoViewer}=await import('/src/PhotoViewer.tsx');
  window.qa={renders:0,taps:0,closed:0};const h=React.createElement,root=createRoot(document.getElementById('root'));
  function Sheet(){window.qa.renders++;const s=usePlaceSheet(()=>window.qa.closed++);return h('section',{ref:s.rootRef,...s.rootEvents,className:`detail page place-sheet ${s.expanded?'expanded':''} ${s.height!==null?'dragging':''}`,style:{height:s.height!==null?s.height+'px':s.expanded?'100dvh':'50dvh'}},h('button',{className:'sheet-handle',onClick:s.handleClick},'Poignée'),h('header',{className:'page-head'},'Lieu'),h('div',{className:'detail-scroll',ref:s.scrollRef},h('button',{id:'tap',onClick:()=>window.qa.taps++},'Action'),...Array.from({length:35},(_,i)=>h('p',{key:i,style:{height:'40px'}},'Information '+i))));}
  window.qa.sheet=()=>root.render(h(Sheet));window.qa.modal=()=>root.render(h(Modal,{title:'Fenêtre test',onClose:()=>{window.qa.closed++;root.render(null);}},h('button',{id:'modal-action',onClick:()=>window.qa.taps++},'Action'),h('div',{id:'nested',style:{height:'150px',overflow:'auto'}},h('div',{style:{height:'800px'}},'Texte long'))));
  window.qa.photo=()=>root.render(h(PhotoViewer,{photos:[{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='}],onClose:()=>{window.qa.closed++;root.render(null);}}));window.qa.sheet();
 });
 const cdp=await page.context().newCDPSession(page);
 const drag=async(x,y,toY)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(toY-y)*i/10}]});await page.waitForTimeout(12);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(260);};
 await page.locator('#tap').waitFor();let box=await page.locator('.place-sheet').boundingBox();const renders=await page.evaluate(()=>qa.renders);
 await drag(170,box.y+190,box.y-160);
 assert(await page.locator('.place-sheet').evaluate(n=>n.classList.contains('expanded')));report.wholeSheetExpands=true;
 report.rendersDuringGesture=await page.evaluate(()=>qa.renders)-renders;assert(report.rendersDuringGesture<=2);
 await page.locator('#tap').tap();assert.equal(await page.evaluate(()=>qa.taps),1);report.tapAfterDrag=true;
 await page.locator('.detail-scroll').evaluate(n=>n.scrollTop=0);await drag(180,170,340);
 assert.equal(await page.locator('.place-sheet').evaluate(n=>n.classList.contains('expanded')),false);report.wholeSheetReduces=true;
 box=await page.locator('.place-sheet').boundingBox();await drag(170,box.y+170,box.y+300);assert.equal(await page.evaluate(()=>qa.closed),1);report.sheetCloses=true;
 await page.evaluate(()=>qa.modal());await page.locator('dialog').waitFor();await page.locator('#modal-action').tap();assert.equal(await page.evaluate(()=>qa.taps),2);
 await page.locator('#nested').evaluate(n=>n.scrollTop=200);box=await page.locator('#nested').boundingBox();await drag(170,box.y+35,box.y+95);assert.equal(await page.locator('dialog').count(),1);assert(await page.locator('#nested').evaluate(n=>n.scrollTop<200));report.nestedScrollPreserved=true;
 box=await page.locator('.dialog-head').boundingBox();await drag(170,box.y+15,box.y+130);assert.equal(await page.locator('dialog').count(),0);report.dialogHeaderCloses=true;
 await page.evaluate(()=>qa.modal());await page.locator('#nested').waitFor();box=await page.locator('#nested').boundingBox();await drag(170,box.y+15,box.y+115);assert.equal(await page.locator('dialog').count(),0);report.dialogContentClosesAtTop=true;
 await page.evaluate(()=>qa.photo());await page.locator('.photo-canvas img').waitFor();box=await page.locator('.photo-canvas').boundingBox();await drag(170,box.y+100,box.y+230);assert.equal(await page.locator('dialog').count(),0);report.photoViewerCloses=true;
 await page.evaluate(()=>qa.photo());await page.locator('.photo-canvas img').waitFor();await page.locator('.photo-canvas').dblclick();
 await page.waitForFunction(()=>Number(document.querySelector('.photo-canvas').dataset.zoom)>1);
 box=await page.locator('.photo-canvas').boundingBox();await drag(170,box.y+100,box.y+230);assert.equal(await page.locator('dialog').count(),1);report.zoomedPhotoPanPreserved=true;
 assert.deepEqual(report.errors,[]);await writeFile('livraison/audit-0.1.59/gestures.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
