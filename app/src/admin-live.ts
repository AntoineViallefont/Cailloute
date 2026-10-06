import type { FreeCursor } from "./free-sync-policy";

// Ne recrée pas une écoute tant que son compte, sa zone et son curseur restent identiques.
export class AdminLive {
  private subscriptions = new Map<string, {key:string; stop:()=>void}>();
  constructor(private watch: (cell:string, cursor:FreeCursor|null, changed:()=>void, failed:(error:unknown)=>void)=>()=>void) {}
  clear() {
    for(const s of this.subscriptions.values()) s.stop();
    this.subscriptions.clear();
  }
  update(owner:string, zones:Record<string,{cursor:FreeCursor|null}>, changed:(cell:string)=>void, failed:(error:unknown)=>void) {
    for(const [cell,s] of this.subscriptions) if(!zones[cell]) {s.stop();this.subscriptions.delete(cell);}
    for(const [cell,zone] of Object.entries(zones)) {
      const key=JSON.stringify([owner,zone.cursor]);
      if(this.subscriptions.get(cell)?.key===key)continue;
      this.subscriptions.get(cell)?.stop();
      const entry={key,stop:()=>{}};
      this.subscriptions.set(cell,entry);
      entry.stop=this.watch(cell,zone.cursor,()=>{
        if(this.subscriptions.get(cell)!==entry)return;
        entry.stop();this.subscriptions.delete(cell);changed(cell);
      },error=>{
        if(this.subscriptions.get(cell)!==entry)return;
        this.clear();failed(error);
      });
    }
  }
}
