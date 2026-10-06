import { describe, expect, it, vi } from "vitest";
import { AdminLive } from "./admin-live";
describe("cycle de vie de l’écoute administrateur",()=>{
 it("réutilise le curseur et ignore les callbacks après déconnexion",()=>{
  const stop=vi.fn(), watch=vi.fn((_cell:string,_cursor:unknown,_changed:()=>void,_failed:(error:unknown)=>void)=>stop), changed=vi.fn(), failed=vi.fn();
  const live=new AdminLive(watch);
  live.update("admin",{zone:{cursor:null}},changed,failed);
  live.update("admin",{zone:{cursor:null}},changed,failed);
  expect(watch).toHaveBeenCalledTimes(1);
  live.clear();
  const callbacks=watch.mock.calls[0] as unknown as [string,null,()=>void,(error:unknown)=>void];
  callbacks[2]();callbacks[3](new Error("ancien écouteur"));
  expect(changed).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();expect(stop).toHaveBeenCalledTimes(1);
 });
 it("remplace les zones quittées et détache après une nouveauté",()=>{
  const stops=[vi.fn(),vi.fn()];let index=0;
  const watch=vi.fn((_cell:string,_cursor:unknown,_changed:()=>void,_failed:(error:unknown)=>void)=>stops[index++]);
  const live=new AdminLive(watch), changed=vi.fn();
  live.update("admin",{a:{cursor:null}},changed,vi.fn());
  live.update("admin",{b:{cursor:null}},changed,vi.fn());
  expect(stops[0]).toHaveBeenCalledTimes(1);
  watch.mock.calls[1][2]();watch.mock.calls[1][2]();
  expect(changed).toHaveBeenCalledExactlyOnceWith("b");expect(stops[1]).toHaveBeenCalledTimes(1);
 });
});
