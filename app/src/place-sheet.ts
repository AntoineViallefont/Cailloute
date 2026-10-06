export type SheetPosition = "half" | "full" | "closed";
/** Répartit un déplacement entre la fiche et son contenu, sans perdre le reliquat. */
export function consumeSheetMotion(
  height: number,
  scroll: number,
  upward: number,
  full: number,
  maxScroll: number,
  content = true,
) {
  if (upward > 0) {
    const grow = Math.min(upward, full - height);
    height += grow;
    if (content) scroll = Math.min(maxScroll, scroll + upward - grow);
  } else {
    const rewind = content ? Math.min(scroll, -upward) : 0;
    scroll -= rewind;
    height = Math.max(0, height + upward + rewind);
  }
  return { height, scroll };
}
export function settleSheet(
  startExpanded: boolean,
  height: number,
  full: number,
): SheetPosition {
  const half = full / 2;
  if (height < half - 64) return "closed";
  if (startExpanded) return height < full - 48 ? "half" : "full";
  return height > half + 48 ? "full" : "half";
}
