import {useEffect,useRef,type RefObject} from 'react';

// Le défilement du formulaire reste natif ; la fermeture commence au bord supérieur.
export function canPullDialog(target:Element,dialog:HTMLElement){
  if(target.closest('input,textarea,select,canvas,.photo-canvas,.privacy-image-scroll,[data-no-dismiss]'))return false;
  if(target.closest('.dialog-head'))return true;
  for(let node:Element|null=target;node;node=node.parentElement){
    if(node.scrollTop>0)return false;
    if(node===dialog)break;
  }
  return true;
}
export function useDismissGesture(ref:RefObject<HTMLDialogElement|null>,onClose:()=>void){
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const dialog=ref.current;if(!dialog)return;
    let gesture:{x:number;y:number;target:Element;drag:number;active:boolean}|null=null;
    let suppress=false,wheelDistance=0,wheelTime=0;
    const reset=()=>{dialog.style.removeProperty('transform');dialog.classList.remove('pulling');};
    const start=(x:number,y:number,target:Element)=>{suppress=false;gesture={x,y,target,drag:0,active:false};};
    const move=(x:number,y:number,prevent:()=>void)=>{
      const g=gesture;if(!g)return;
      const dx=x-g.x,dy=y-g.y;
      if(!g.active){
        if(!canPullDialog(g.target,dialog)){g.x=x;g.y=y;return;}
        if(Math.abs(dx)>12 && Math.abs(dx)>Math.abs(dy)){gesture=null;return;}
        if(dy<10 || dy<Math.abs(dx)*1.3)return;
        g.active=true;suppress=true;
      }
      prevent();g.drag=Math.max(0,dy);
      dialog.classList.add('pulling');dialog.style.transform=`translateY(${g.drag}px)`;
    };
    const finish=()=>{const g=gesture;gesture=null;reset();if(g?.active && g.drag>=85)close.current();};
    const touchStart=(e:TouchEvent)=>{
      if((e.target as Element).closest("dialog")!==dialog)return;
      if(e.touches.length!==1){gesture=null;reset();return;}
      const t=e.touches[0];start(t.clientX,t.clientY,e.target as Element);
    };
    const touchMove=(e:TouchEvent)=>{
      if(e.touches.length!==1){gesture=null;reset();return;}
      const t=e.touches[0];move(t.clientX,t.clientY,()=>e.preventDefault());
    };
    const pointerDown=(e:PointerEvent)=>{if((e.target as Element).closest('dialog')===dialog && e.pointerType==='mouse' && e.button===0 && (e.target as Element).closest('.dialog-head'))start(e.clientX,e.clientY,e.target as Element);};
    const pointerMove=(e:PointerEvent)=>{if(e.pointerType==='mouse' && e.buttons===1)move(e.clientX,e.clientY,()=>e.preventDefault());};
    const pointerUp=(e:PointerEvent)=>{if(e.pointerType==='mouse')finish();};
    const cancel=()=>{gesture=null;suppress=false;reset();};
    const click=(e:MouseEvent)=>{if(suppress){suppress=false;e.preventDefault();e.stopPropagation();}};
    const wheel=(e:WheelEvent)=>{
      if((e.target as Element).closest("dialog")!==dialog)return;
      if(e.ctrlKey || Math.abs(e.deltaX)>Math.abs(e.deltaY) || e.deltaY>=0 || !canPullDialog(e.target as Element,dialog)){wheelDistance=0;return;}
      const now=performance.now();if(now-wheelTime>180)wheelDistance=0;wheelTime=now;
      e.preventDefault();wheelDistance+=-e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?dialog.clientHeight:1);
      if(wheelDistance>=100){wheelDistance=0;close.current();}
    };
    dialog.addEventListener('touchstart',touchStart,{passive:true});
    dialog.addEventListener('touchmove',touchMove,{passive:false});
    dialog.addEventListener('touchend',finish);dialog.addEventListener('touchcancel',cancel);
    dialog.addEventListener('pointerdown',pointerDown);dialog.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);
    dialog.addEventListener('click',click,true);dialog.addEventListener('wheel',wheel,{passive:false});
    return()=>{dialog.removeEventListener('touchstart',touchStart);dialog.removeEventListener('touchmove',touchMove);dialog.removeEventListener('touchend',finish);dialog.removeEventListener('touchcancel',cancel);dialog.removeEventListener('pointerdown',pointerDown);dialog.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);dialog.removeEventListener('click',click,true);dialog.removeEventListener('wheel',wheel);reset();};
  },[ref]);
}
