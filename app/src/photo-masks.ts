// Coordonnées relatives à l'image orientée : indépendantes du zoom et de la compression.
export interface PhotoMask {
  x: number;
  y: number;
  width: number;
  height: number;
  rounded?: boolean;
}
export function boundedMask(mask: PhotoMask): PhotoMask | null {
  if (
    ![mask.x, mask.y, mask.width, mask.height].every(Number.isFinite) ||
    mask.width <= 0 ||
    mask.height <= 0
  )
    return null;
  const x = Math.max(0, mask.x),
    y = Math.max(0, mask.y);
  const right = Math.min(1, mask.x + mask.width),
    bottom = Math.min(1, mask.y + mask.height);
  return right > x && bottom > y
    ? {
        x,
        y,
        width: right - x,
        height: bottom - y,
        ...(mask.rounded ? { rounded: true } : {}),
      }
    : null;
}
export function expandedFace(box: PhotoMask): PhotoMask | null {
  return boundedMask({
    x: box.x - box.width * 0.4,
    y: box.y - box.height * 0.5,
    width: box.width * 1.8,
    height: box.height * 2,
    rounded: true,
  });
}
export function drawPhotoMasks(
  context: CanvasRenderingContext2D,
  masks: PhotoMask[],
) {
  const { width, height } = context.canvas;
  for (const candidate of masks) {
    const mask = boundedMask(candidate);
    if (!mask) continue;
    const x = Math.floor(mask.x * width),
      y = Math.floor(mask.y * height);
    const w = Math.min(width - x, Math.ceil((mask.x + mask.width) * width) - x);
    const h = Math.min(
      height - y,
      Math.ceil((mask.y + mask.height) * height) - y,
    );
    // Une résolution intermédiaire conserve les nuances ; le flou retire les détails.
    const tiny = document.createElement("canvas");
    const smoothSupported = "filter" in context;
    const resolution = smoothSupported ? 24 : 8;
    tiny.width = tiny.height = resolution;
    tiny
      .getContext("2d")!
      .drawImage(context.canvas, x, y, w, h, 0, 0, resolution, resolution);
    const radius = Math.max(3, Math.min(w, h) * 0.065);
    const padding = Math.ceil(radius * 3);
    const patch = document.createElement("canvas");
    patch.width = w + padding * 2;
    patch.height = h + padding * 2;
    const paint = patch.getContext("2d")!;
    paint.imageSmoothingEnabled = true;
    paint.drawImage(tiny, padding, padding, w, h);
    // Prolonger les bords du fragment pour ne pas retrouver des détails originaux.
    paint.drawImage(tiny, 0, 0, resolution, 1, padding, 0, w, padding);
    paint.drawImage(
      tiny,
      0,
      resolution - 1,
      resolution,
      1,
      padding,
      padding + h,
      w,
      padding,
    );
    paint.drawImage(tiny, 0, 0, 1, resolution, 0, padding, padding, h);
    paint.drawImage(
      tiny,
      resolution - 1,
      0,
      1,
      resolution,
      padding + w,
      padding,
      padding,
      h,
    );
    for (const [sx, dx] of [
      [0, 0],
      [resolution - 1, padding + w],
    ])
      for (const [sy, dy] of [
        [0, 0],
        [resolution - 1, padding + h],
      ])
        paint.drawImage(tiny, sx, sy, 1, 1, dx, dy, padding, padding);
    const blurred = document.createElement("canvas");
    blurred.width = w;
    blurred.height = h;
    const output = blurred.getContext("2d")!;
    if (smoothSupported) output.filter = `blur(${radius}px)`;
    output.drawImage(patch, -padding, -padding);
    output.filter = "none";
    // Bord doux sur les masques automatiques, à l'extérieur du visage détecté.
    if (mask.rounded && candidate.x > 0 && candidate.y > 0 && candidate.x + candidate.width < 1 && candidate.y + candidate.height < 1) {
      const edge = Math.max(1, Math.min(w, h) * 0.025);
      const alpha = document.createElement("canvas");
      alpha.width = w;
      alpha.height = h;
      const shape = alpha.getContext("2d")!;
      shape.filter = `blur(${edge}px)`;
      shape.beginPath();
      shape.ellipse(w / 2, h / 2, Math.max(1, w / 2 - edge * 2), Math.max(1, h / 2 - edge * 2), 0, 0, Math.PI * 2);
      shape.fill();
      output.globalCompositeOperation = "destination-in";
      output.drawImage(alpha, 0, 0);
    }
    context.drawImage(blurred, x, y);
  }
}
