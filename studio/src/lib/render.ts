// Turns a photo plus its mask and edit settings into the finished image.
import { renderBackdrop } from "./backgrounds";
import { decode, drawCover, makeCanvas, supportsFilter, type Canvas, type Ctx } from "./canvas";
import { pixelate, plateArt, warpOnto } from "./plate";
import type { EditSettings, Settings } from "./types";

export interface BBox { x: number; y: number; w: number; h: number; bottom: number }

export interface Prepared {
  src: Canvas;
  alpha: Uint8Array | null;
  bbox: BBox | null;
  /** Tone curve for "Enhance", worked out from the car pixels only. */
  lut: Uint8Array;
}

export const ASPECTS = { "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9, "1:1": 1 } as const;

export function outputSize(s: Settings, width = s.outputWidth) {
  return { W: width, H: Math.round(width / ASPECTS[s.aspect]) };
}

async function maskAlpha(png: Blob, w: number, h: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(png);
  const [, ctx] = makeCanvas(w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const px = ctx.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4];
  return a;
}

function findBBox(a: Uint8Array, w: number, h: number): BBox | null {
  const rows = new Uint32Array(h);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x] > 128) {
        rows[y]++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  // Ignore a few stray pixels when finding where the tyres meet the ground.
  const minRow = Math.max(2, (x1 - x0) * 0.01);
  let bottom = y1;
  while (bottom > y0 && rows[bottom] < minRow) bottom--;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: bottom - y0 + 1, bottom };
}

function buildLut(src: Canvas, alpha: Uint8Array | null): Uint8Array {
  const ctx = src.getContext("2d")!;
  const px = ctx.getImageData(0, 0, src.width, src.height).data;
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0, p = 0; i < px.length; i += 16, p += 4) {
    if (alpha && alpha[p] < 200) continue;
    hist[(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0]++;
    n++;
  }
  const pct = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= n * q) return v;
    return 255;
  };
  // Stretch luminance gently. One curve for all channels so paint colour doesn't shift.
  let lo = Math.min(pct(0.005), 40), hi = Math.max(pct(0.995), 200);
  if ((hi - lo) / 255 < 1 / 1.35) {
    const mid = (hi + lo) / 2, half = (255 / 1.35) / 2;
    lo = mid - half;
    hi = mid + half;
  }
  const mean = (() => {
    let s = 0;
    for (let v = 0; v < 256; v++) s += hist[v] * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    return n ? s / n : 0.5;
  })();
  const gamma = Math.min(1.15, Math.max(0.85, Math.log(0.48) / Math.log(Math.min(0.95, Math.max(0.05, mean)))));
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    lut[v] = Math.round(Math.pow(t, 1 / gamma) * 255);
  }
  return lut;
}

export async function prepare(original: Blob, mask: Blob | undefined, maxEdge: number): Promise<Prepared> {
  const src = await decode(original, maxEdge);
  const alpha = mask ? await maskAlpha(mask, src.width, src.height) : null;
  const bbox = alpha ? findBBox(alpha, src.width, src.height) : null;
  return { src, alpha, bbox, lut: buildLut(src, alpha) };
}

function enhance(ctx: Ctx, w: number, h: number, lut: Uint8Array) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const sat = 1.08;
  for (let i = 0; i < d.length; i += 4) {
    const r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    d[i] = Math.max(0, Math.min(255, l + (r - l) * sat));
    d[i + 1] = Math.max(0, Math.min(255, l + (g - l) * sat));
    d[i + 2] = Math.max(0, Math.min(255, l + (b - l) * sat));
  }
  ctx.putImageData(img, 0, 0);
}

async function watermark(ctx: Ctx, W: number, H: number, s: Settings) {
  if (!s.logo) return;
  const logo = await decode(s.logo, 1200);
  const w = W * s.watermarkSize, h = (logo.height / logo.width) * w, m = W * 0.025;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(logo, W - w - m, H - h - m, w, h);
  ctx.globalAlpha = 1;
}

export async function compose(prep: Prepared, edit: EditSettings, s: Settings, W: number, H: number): Promise<Canvas> {
  const { src } = prep;
  const [work, wctx] = makeCanvas(src.width, src.height);
  wctx.drawImage(src, 0, 0);

  if (edit.plateQuad && edit.plateMode !== "none") {
    const quad = edit.plateQuad.map(([x, y]) => [x * src.width, y * src.height] as [number, number]);
    if (edit.plateMode === "cover") warpOnto(wctx, await plateArt(s), quad);
    else pixelate(wctx, src, quad);
  }
  if (edit.enhance) enhance(wctx, work.width, work.height, prep.lut);

  const [out, ctx] = makeCanvas(W, H);

  if (!edit.removeBg || !prep.alpha || !prep.bbox) {
    if (edit.removeBg && !prep.alpha) throw new Error("No cut-out yet. Process the photo first.");
    if (edit.removeBg && !prep.bbox) throw new Error("No car found in this photo.");
    drawCover(ctx, work, W, H);
    if (edit.watermark) await watermark(ctx, W, H, s);
    return out;
  }

  // Cut the car out.
  const img = wctx.getImageData(0, 0, work.width, work.height);
  for (let i = 0, p = 3; i < prep.alpha.length; i++, p += 4) img.data[p] = prep.alpha[i];
  wctx.putImageData(img, 0, 0);

  const { canvas: bg, bd } = await renderBackdrop(edit.background, W, H);
  ctx.drawImage(bg, 0, 0);

  const b = prep.bbox;
  const k = Math.min((W * 0.8) / b.w, (H * 0.6) / b.h) * edit.scale;
  const dw = work.width * k, dh = work.height * k;
  const ground = bd.ground * H + edit.offsetY * H;
  const dx = W / 2 - (b.x + b.w / 2) * k;
  const dy = ground - b.bottom * k;

  // Scale once, reuse for shadow, reflection and the car itself.
  const [car, cctx] = makeCanvas(dw, dh);
  cctx.drawImage(work, 0, 0, dw, dh);

  if (edit.shadow) {
    const cx = dx + (b.x + b.w / 2) * k, cw = b.w * k, ch = b.h * k;
    // Broad ambient shadow.
    ctx.save();
    ctx.translate(cx, ground);
    ctx.scale(1, Math.max(0.04, (ch * 0.09) / (cw * 0.58)));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cw * 0.58);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(0.6, "rgba(0,0,0,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-cw, -cw, cw * 2, cw * 2);
    ctx.restore();
    // Contact shadow: the silhouette squashed flat under the car.
    const [sil, sctx] = makeCanvas(dw, dh);
    sctx.drawImage(car, 0, 0);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = "#000";
    sctx.fillRect(0, 0, dw, dh);
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (supportsFilter()) ctx.filter = `blur(${Math.max(2, ch * 0.012)}px)`;
    const sh = ch * 0.05;
    ctx.drawImage(sil, 0, b.y * k, dw, b.h * k, dx, ground - sh * 0.55, dw, sh);
    ctx.restore();
  }

  if (edit.reflection) {
    const rh = b.h * k * 0.45;
    const [refl, rctx] = makeCanvas(dw, rh);
    rctx.setTransform(1, 0, 0, -1, 0, b.bottom * k);
    rctx.drawImage(car, 0, 0);
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.globalCompositeOperation = "destination-in";
    const fade = rctx.createLinearGradient(0, 0, 0, rh);
    fade.addColorStop(0, `rgba(0,0,0,${bd.glossy ? 0.32 : 0.18})`);
    fade.addColorStop(1, "rgba(0,0,0,0)");
    rctx.fillStyle = fade;
    rctx.fillRect(0, 0, dw, rh);
    ctx.drawImage(refl, dx, ground);
  }

  ctx.drawImage(car, dx, dy);
  if (edit.watermark) await watermark(ctx, W, H, s);
  return out;
}
