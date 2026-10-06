import { afterEach, beforeEach, expect, it, vi } from "vitest";
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((e: {data: unknown}) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  last: any;
  terminate = vi.fn();
  constructor() { instances.push(this); }
  postMessage(value: unknown) { this.last = value; }
  reply(data: object) { this.onmessage?.({data: {id: this.last.id, ...data}}); }
}
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); instances.length = 0; vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("conserve les zones détectées à l’échéance et signale une analyse incomplète", async () => {
  const {detectHeads} = await import("./head-detection-client");
  const result = detectHeads(new Blob(), undefined, undefined, 600);
  const masks = [{x:0.1,y:0.2,width:0.3,height:0.3}];
  instances[0].reply({progress:1,total:5,masks});
  await vi.advanceTimersByTimeAsync(600);
  expect(await result).toEqual({masks,incomplete:true}); expect(instances[0].terminate).toHaveBeenCalledOnce();
});
it("réutilise le modèle et termine le worker lors d’une annulation", async () => {
  const {detectHeads} = await import("./head-detection-client");
  const first=detectHeads(new Blob());instances[0].reply({masks:[]});expect(await first).toEqual({masks:[],incomplete:false});
  const controller=new AbortController();const next=detectHeads(new Blob(),controller.signal);
  const assertion=expect(next).rejects.toMatchObject({name:"AbortError"});controller.abort();await assertion;
  expect(instances).toHaveLength(1);expect(instances[0].terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
