import type { InferenceSession } from "onnxruntime-web/wasm";
import { detectionAreas } from "./photo-detection-areas";
import { type HeadBox } from "./head-detection";
import { decodeFaces, faceMasks } from "./face-detection";

let session: Promise<InferenceSession> | undefined;
self.onmessage = async (event: MessageEvent<{ id: string; blob?: Blob }>) => {
  const { id, blob } = event.data;
  let image: ImageBitmap | undefined;
  try {
    // Distribution locale exacte : évite tout CDN et toute copie WASM en double.
    const runtimeUrl = new URL(
      "/photo-privacy/ort/ort.wasm.min.mjs",
      self.location.origin,
    ).href;
    const {
      env,
      InferenceSession,
      Tensor,
    }: typeof import("onnxruntime-web/wasm") = await import(
      /* @vite-ignore */ runtimeUrl
    );
    env.wasm.wasmPaths = new URL(
      "/photo-privacy/ort/",
      self.location.origin,
    ).href;
    env.wasm.numThreads = 1;
    session ||= InferenceSession.create(
      new URL("/photo-privacy/face-detector.onnx", self.location.origin).href,
      { executionProviders: ["wasm"] },
    );
    const model = await session;
    if (!blob) { self.postMessage({ id, ready: true }); return; }
    image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(640, 640);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const input = new Float32Array(3 * 640 * 640);
    const heads: HeadBox[] = [];
    const areas = detectionAreas(image.width, image.height);
    for (const [index, area] of areas.entries()) {
      ctx.drawImage(
        image,
        area.x * image.width,
        area.y * image.height,
        area.width * image.width,
        area.height * image.height,
        0,
        0,
        640,
        640,
      );
      const rgba = ctx.getImageData(0, 0, 640, 640).data,
        n = 640 * 640;
      for (let p = 0; p < n; p++) {
        input[p] = rgba[p * 4 + 2];
        input[n + p] = rgba[p * 4 + 1];
        input[2 * n + p] = rgba[p * 4];
      }
      const tensor = new Tensor("float32", input, [1, 3, 640, 640]);
      const result = await model.run({ [model.inputNames[0]]: tensor });
      try {
        heads.push(...decodeFaces(result, area));
        self.postMessage({ id, progress: index + 1, total: areas.length, masks: faceMasks(heads) });
      } finally {
        tensor.dispose();
        Object.values(result).forEach((t) => t.dispose());
      }
    }
    const masks = faceMasks(heads);
    self.postMessage({ id, masks });
  } catch (error) {
    session = undefined;
    self.postMessage({ id, error: String(error) });
  } finally {
    image?.close();
  }
};
