import { afterEach, expect, it, vi } from "vitest";
import { photoTask } from "./photo-task";
afterEach(() => vi.useRealTimers());
it("rend la main si une API photo ne répond jamais", async () => {
  vi.useFakeTimers();
  const result = photoTask(new Promise(() => {}), 1000, "Lecture bloquée.");
  const assertion = expect(result).rejects.toThrow("Lecture bloquée.");
  await vi.advanceTimersByTimeAsync(1000); await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
it("annule immédiatement et libère une image décodée trop tard", async () => {
  const controller = new AbortController(); const close = vi.fn();
  let finish!: (value: { close: typeof close }) => void;
  const result = photoTask(new Promise<{close: typeof close}>(r => finish = r), 1000, "Erreur", controller.signal, value => value.close());
  const assertion = expect(result).rejects.toMatchObject({name: "AbortError"});
  controller.abort(); await assertion; finish({close}); await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
});
