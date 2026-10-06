import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), encode: vi.fn(), cancel: vi.fn(async () => {}) }));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => ({ prepare: mocks.prepare, cancelPrepare: mocks.cancel }) }));
vi.mock("./photo-input", () => ({ preparePhoto: mocks.encode }));
import { prepareNativePrivatePhoto } from "./native-photo-privacy";
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
describe("Photo Android réduite avant le pont", () => {
  it("utilise la copie réduite, conserve les masques/GPS et exige une vérification humaine", async () => {
    const masks = [{ x: .2, y: .3, width: .15, height: .2, rounded: true }];
    const position = { lat: 45, lon: 4, source: "exif" };
    mocks.prepare.mockResolvedValue({ base64: btoa("small JPEG"), masks, incomplete: false, position });
    mocks.encode.mockResolvedValue({ base64: "blurred-preview", caption: "" });
    const result = await prepareNativePrivatePhoto("content://photo/1", undefined, undefined, undefined, true);
    expect(mocks.prepare).toHaveBeenCalledWith({ uri: "content://photo/1", includePosition: true, id: expect.any(String) });
    expect(await (mocks.encode.mock.calls[0][0] as Blob).text()).toBe("small JPEG");
    expect(mocks.encode.mock.calls[0].slice(1, 3)).toEqual([position, masks]);
    expect(result).toMatchObject({ reviewed: false, automatic: masks, detectionFailed: false, prepared: { base64: "blurred-preview" } });
  });
  it("ignore un résultat natif tardif après annulation, sans lancer le floutage", async () => {
    let finish!: (value: unknown) => void;
    mocks.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const task = prepareNativePrivatePhoto("content://photo/1", undefined, controller.signal);
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    finish({ base64: btoa("small"), masks: [], incomplete: false });
    await Promise.resolve();
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalled();
  });
  it("conserve l'avertissement en cas d'analyse incomplète", async () => {
    mocks.prepare.mockResolvedValue({ base64: btoa("small"), masks: [], incomplete: true });
    mocks.encode.mockResolvedValue({ base64: "preview", caption: "" });
    expect(await prepareNativePrivatePhoto("file:///photo.jpg")).toMatchObject({ detectionFailed: true, reviewed: false });
  });
  it("réutilise l'aperçu natif masqué sans second décodage ni floutage WebView", async () => {
    mocks.prepare.mockResolvedValue({ base64: btoa("working copy"), masks: [], incomplete: false,
      preview: { base64: "native-blurred-preview", caption: "" } });
    const result = await prepareNativePrivatePhoto("content://photo/1");
    expect(mocks.encode).not.toHaveBeenCalled();
    expect(result.prepared.base64).toBe("native-blurred-preview");
    expect(result.reviewed).toBe(false);
  });
});
