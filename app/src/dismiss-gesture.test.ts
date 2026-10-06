import {it,expect} from 'vitest';
import {canPullDialog} from './useDismissGesture';
function node(scrollTop=0,parentElement:Element|null=null,match=false,head=false){return {scrollTop,parentElement,closest:(selector:string)=>selector==='.dialog-head'?head:match} as unknown as Element;}
it('ne ferme pas une fenêtre tant que son contenu ou un défilement imbriqué est descendu',()=>{
 const dialog=node(0) as HTMLElement,inner=node(100,dialog),target=node(0,inner);
 expect(canPullDialog(target,dialog)).toBe(false);
 inner.scrollTop=0;expect(canPullDialog(target,dialog)).toBe(true);
 dialog.scrollTop=20;expect(canPullDialog(target,dialog)).toBe(false);
});
it('laisse les champs et les surfaces de retouche tranquilles et autorise le titre',()=>{
 const dialog=node(100) as HTMLElement;
 expect(canPullDialog(node(0,dialog,true),dialog)).toBe(false);
 expect(canPullDialog(node(0,dialog,false,true),dialog)).toBe(true);
});
