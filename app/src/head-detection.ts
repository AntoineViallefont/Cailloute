import { boundedMask, type PhotoMask } from "./photo-masks";
export interface HeadBox extends PhotoMask {
  score: number;
}
export function suppressDuplicateHeads(boxes: HeadBox[]): HeadBox[] {
  const kept: HeadBox[] = [];
  for (const box of [...boxes].sort((a, b) => b.score - a.score)) {
    if (
      kept.every((k) => {
        const intersection =
          Math.max(
            0,
            Math.min(k.x + k.width, box.x + box.width) - Math.max(k.x, box.x),
          ) *
          Math.max(
            0,
            Math.min(k.y + k.height, box.y + box.height) - Math.max(k.y, box.y),
          );
        return (
          intersection /
            (k.width * k.height + box.width * box.height - intersection) <
          0.4
        );
      })
    )
      kept.push(box);
  }
  return kept;
}
// YOLOv9-Wholebody34 : RGB /255, NCHW 640² ; classe 7 = tête (y compris de dos).
export function decodeHeads(
  data: Float32Array,
  dims: readonly number[],
  area: PhotoMask,
): HeadBox[] {
  if (dims.length !== 3 || dims[0] !== 1 || Math.min(dims[1], dims[2]) !== 38)
    throw new Error("Format de détection inattendu.");
  const first = dims[1] < dims[2],
    count = first ? dims[2] : dims[1];
  const value = (c: number, i: number) =>
    data[first ? c * count + i : i * 38 + c];
  const boxes: HeadBox[] = [];
  for (let i = 0; i < count; i++) {
    const score = value(11, i);
    if (!Number.isFinite(score) || score < 0.22) continue;
    const width = (value(2, i) / 640) * area.width,
      height = (value(3, i) / 640) * area.height;
    const box = boundedMask({
      x: area.x + (value(0, i) / 640) * area.width - width / 2,
      y: area.y + (value(1, i) / 640) * area.height - height / 2,
      width,
      height,
    });
    if (box) boxes.push({ ...box, score });
  }
  return suppressDuplicateHeads(boxes);
}
export function headMask(head: PhotoMask): PhotoMask {
  return boundedMask({
    x: head.x - head.width * 0.4,
    y: head.y - head.height * 0.5,
    width: head.width * 1.8,
    height: head.height * 2,
    rounded: true,
  })!;
}
