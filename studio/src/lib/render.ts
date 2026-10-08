// Turns a photo plus its mask and edit settings into the finished image.
import { getBackdrop, renderBackdrop } from "./backgrounds";
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

  const { bd } = await getBackdrop(edit.background);
  const b = prep.bbox;
  const k = Math.min((W * 0.8) / b.w, (H * 0.64) / b.h) * edit.scale;
  const dw = work.width * k, dh = work.height * k;
  const ground = bd.ground * H + edit.offsetY * H;
  const dx = W / 2 - (b.x + b.w / 2) * k;
  const dy = ground - b.bottom * k;

  // Floor meets wall about halfway up the car, so the far wheels stand on floor.
  const carTop = dy + b.y * k;
  const seam = Math.min(ground - H * 0.12, Math.max(H * 0.3, carTop + (ground - carTop) * 0.5)) / H;
  const { canvas: bg } = await renderBackdrop(edit.background, W, H, seam, ground / H);
  ctx.drawImage(bg, 0, 0);

  // Scale once, reuse for shadow, reflection and the car itself.
  const [car, cctx] = makeCanvas(dw, dh);
  cctx.drawImage(work, 0, 0, dw, dh);
  const carPx = cctx.getImageData(0, 0, car.width, car.height);
  const contact = groundLine(carPx);

  if (edit.reflection && contact) {
    const refl = reflect(carPx, contact, b.h * k * 0.5, bd.glossy ? 0.22 : 0.1);
    ctx.drawImage(refl, dx, dy);
  }
  if (edit.shadow && contact) drawShadow(ctx, contact, dx, dy, b.h * k);

  ctx.drawImage(car, dx, dy);
  if (edit.watermark) await watermark(ctx, W, H, s);
  return out;
}

interface Contact {
  /** Lowest car pixel per column, -1 where the column is empty. */
  bottom: Float32Array;
  /** Where each column meets the floor: the lower convex hull of `bottom`. */
  hull: Float32Array;
  x0: number;
  x1: number;
}

/**
 * Works out where the car touches the floor. In a 3/4 shot the near and far
 * wheels meet the ground at different heights, so a single flat line is
 * wrong. The lower convex hull of the silhouette runs tyre to tyre and gives
 * the floor line under each column.
 */
function groundLine(img: ImageData): Contact | null {
  const { width: w, height: h, data } = img;
  const bottom = new Float32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        bottom[x] = y;
        break;
      }
    }
  }
  const pts: [number, number][] = [];
  for (let x = 0; x < w; x++) if (bottom[x] >= 0) pts.push([x, bottom[x]]);
  if (pts.length < 2) return null;
  const chain: [number, number][] = [];
  for (const p of pts) {
    while (chain.length >= 2) {
      const [o, a] = [chain[chain.length - 2], chain[chain.length - 1]];
      if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) >= 0) chain.pop();
      else break;
    }
    chain.push(p);
  }
  const hull = new Float32Array(w).fill(-1);
  for (let i = 0; i + 1 < chain.length; i++) {
    const [ax, ay] = chain[i], [bx, by] = chain[i + 1];
    for (let x = ax; x <= bx; x++) hull[x] = ay + ((by - ay) * (x - ax)) / Math.max(1, bx - ax);
  }
  return { bottom, hull, x0: pts[0][0], x1: pts[pts.length - 1][0] };
}

function drawShadow(ctx: Ctx, c: Contact, dx: number, dy: number, carH: number) {
  const blur = supportsFilter();
  const step = Math.max(1, Math.round((c.x1 - c.x0) / 300));
  const along = (fn: (x: number) => number) => {
    const pts: [number, number][] = [];
    for (let x = c.x0; x <= c.x1; x += step) pts.push([dx + x, dy + fn(x)]);
    pts.push([dx + c.x1, dy + fn(c.x1)]);
    return pts;
  };

  // Soft spread on the floor around the footprint.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  if (blur) ctx.filter = `blur(${Math.max(4, carH * 0.05)}px)`;
  const spread = carH * 0.06;
  ctx.beginPath();
  along((x) => c.hull[x] - spread * 0.5).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x - spread, y)));
  along((x) => c.hull[x] + spread).reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Dark floor under the body, between the tyres.
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#000";
  if (blur) ctx.filter = `blur(${Math.max(2, carH * 0.015)}px)`;
  ctx.beginPath();
  along((x) => Math.min(c.bottom[x], c.hull[x])).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  along((x) => c.hull[x] + carH * 0.012).reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Tight contact line where rubber meets floor.
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = Math.max(2, carH * 0.012);
  if (blur) ctx.filter = `blur(${Math.max(1, carH * 0.006)}px)`;
  ctx.beginPath();
  along((x) => c.hull[x]).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

/** Mirrors each column about its own floor line and fades it out. */
function reflect(img: ImageData, c: Contact, depth: number, strength: number): Canvas {
  const { width: w, height: h, data } = img;
  const outH = Math.min(h + Math.ceil(depth), Math.ceil(Math.max(...c.hull) + depth) + 1);
  const [cv, ctx] = makeCanvas(w, outH);
  const out = ctx.createImageData(w, outH);
  const d = out.data;
  for (let x = c.x0; x <= c.x1; x++) {
    const g = c.hull[x];
    if (g < 0) continue;
    const start = Math.ceil(g);
    for (let y = start; y < Math.min(outH, start + depth); y++) {
      const sy = Math.round(2 * g - y);
      if (sy < 0 || sy >= h) continue;
      const si = (sy * w + x) * 4, di = (y * w + x) * 4;
      const t = (y - g) / depth;
      const a = data[si + 3] * strength * (1 - t) * (1 - t);
      d[di] = data[si];
      d[di + 1] = data[si + 1];
      d[di + 2] = data[si + 2];
      d[di + 3] = a;
    }
  }
  ctx.putImageData(out, 0, 0);
  return cv;
}
