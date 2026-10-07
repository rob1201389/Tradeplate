export type Canvas = OffscreenCanvas;
export type Ctx = OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [Canvas, Ctx] {
  const c = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

/** Decodes with EXIF orientation applied and caps the long edge. */
export async function decode(blob: Blob, maxEdge: number): Promise<Canvas> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const [c, ctx] = makeCanvas(bmp.width * k, bmp.height * k);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export function drawCover(ctx: Ctx, src: CanvasImageSource & { width: number; height: number }, W: number, H: number) {
  const k = Math.max(W / src.width, H / src.height);
  const w = src.width * k, h = src.height * k;
  ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

export const toJpeg = (c: Canvas, q: number) => c.convertToBlob({ type: "image/jpeg", quality: q });

export async function thumbnail(blob: Blob, edge = 360): Promise<Blob> {
  return toJpeg(await decode(blob, edge), 0.8);
}

/** Whether ctx.filter works (it is a no-op on some browsers). */
let filterOk: boolean | null = null;
export function supportsFilter() {
  if (filterOk !== null) return filterOk;
  const [, ctx] = makeCanvas(4, 4);
  ctx.filter = "blur(2px)";
  filterOk = ctx.filter === "blur(2px)";
  return filterOk;
}
