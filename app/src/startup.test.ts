import {afterEach,it,expect,vi} from "vitest";
afterEach(()=>vi.useRealTimers());
it("attend une carte peinte puis laisse les démarrages suivants passer",async()=>{
 vi.resetModules();vi.useFakeTimers();const {waitForMap,mapPainted}=await import("./startup");
 const done=vi.fn();void waitForMap(8000).then(done);await vi.advanceTimersByTimeAsync(50);expect(done).not.toHaveBeenCalled();
 mapPainted();await Promise.resolve();expect(done).toHaveBeenCalledTimes(1);
 await waitForMap(8000);expect(vi.getTimerCount()).toBe(0);
});
it("ne bloque pas indéfiniment sans réseau ni carte enregistrée",async()=>{
 vi.resetModules();vi.useFakeTimers();const {waitForMap}=await import("./startup");
 const done=vi.fn();void waitForMap(8000).then(done);await vi.advanceTimersByTimeAsync(8000);
 expect(done).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
it('Android : attend les tuiles même au-delà des anciens délais',async()=>{
 vi.resetModules();vi.useFakeTimers();const {waitForMap,mapPainted}=await import('./startup');const done=vi.fn();void waitForMap().then(done);
 await vi.advanceTimersByTimeAsync(20000);expect(done).not.toHaveBeenCalled();mapPainted();await Promise.resolve();expect(done).toHaveBeenCalledTimes(1);
});
it('attend les deux couches et un nouveau déplacement avant de révéler la carte',async()=>{
 vi.resetModules();const {mapLoading,mapPainted,waitForMap,mapSettled}=await import('./startup');
 const fond={},detail={};mapLoading(fond);mapLoading(detail);
 const done=vi.fn();void waitForMap().then(done);
 mapPainted(detail);await Promise.resolve();expect(done).not.toHaveBeenCalled();expect(mapSettled()).toBe(false);
 mapPainted(fond);await Promise.resolve();expect(done).toHaveBeenCalledTimes(1);
 mapLoading(detail);const next=vi.fn();void waitForMap().then(next);await Promise.resolve();expect(next).not.toHaveBeenCalled();
 mapPainted(detail);await Promise.resolve();expect(next).toHaveBeenCalledTimes(1);
});
it('revérifie les tuiles après les images de rendu',async()=>{
 vi.resetModules();let frames:FrameRequestCallback[]=[];
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.push(cb);return frames.length;});
 const {mapPainted,mapLoading,waitForStableMap}=await import('./startup');mapPainted();
 const done=vi.fn();void waitForStableMap().then(done);await Promise.resolve();
 frames.shift()!(0);const moved={};mapLoading(moved);frames.shift()!(0);
 await Promise.resolve();await Promise.resolve();expect(done).not.toHaveBeenCalled();
 mapPainted(moved);await Promise.resolve();await Promise.resolve();frames.shift()!(0);frames.shift()!(0);
 await Promise.resolve();await Promise.resolve();expect(done).toHaveBeenCalledTimes(1);vi.unstubAllGlobals();
});
it('libère l’ouverture lorsque la carte ne termine jamais son chargement',async()=>{
 vi.resetModules();vi.useFakeTimers();const {mapLoading,waitForStableMap}=await import('./startup');mapLoading({});
 const done=vi.fn();void waitForStableMap(8000).then(done);
 await vi.advanceTimersByTimeAsync(7999);expect(done).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);expect(done).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
});
