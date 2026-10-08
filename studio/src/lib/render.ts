// Turns a photo plus its mask and edit settings into the finished image.
import { getBackdrop, renderBackdrop } from "./backgrounds";
import { decode, drawCover, makeCanvas, supportsFilter, type Canvas, type Ctx } from "./canvas";
import { pixelate, plateArt, warpOnto } from "./plate";
import { glassKey, pasteGlass, reduceGlare, tintGlass } from "./glass";
import type { EditSettings, Settings } from "./types";

export interface BBox { x: number; y: number; w: number; h: number; bottom: number }

export interface Prepared {
  src: Canvas;
  alpha: Uint8Array | null;
  bbox: BBox | null;
  /** Tone curve for "Enhance", worked out from the car pixels only. */
  lut: Uint8Array;
  /** Degrees to rotate so the front and rear tyres sit level. 0 if unsure. */
  levelAngle: number;
  /** AI-cleaned photo at src size, and the window outlines it was made for. */
  glassFix: Canvas | null;
  glassFixFor?: string;
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

export async function prepare(original: Blob, mask: Blob | undefined, maxEdge: number, glass?: { fix?: Blob; forKey?: string }): Promise<Prepared> {
  const src = await decode(original, maxEdge);
  let glassFix: Canvas | null = null;
  if (glass?.fix) {
    const [c, ctx] = makeCanvas(src.width, src.height);
    ctx.drawImage(await decode(glass.fix, maxEdge), 0, 0, src.width, src.height);
    glassFix = c;
  }
  const alpha = mask ? await maskAlpha(mask, src.width, src.height) : null;
  const bbox = alpha ? findBBox(alpha, src.width, src.height) : null;
  return { src, alpha, bbox, lut: buildLut(src, alpha), levelAngle: alpha && bbox ? levelAngle(alpha, src.width, bbox) : 0, glassFix, glassFixFor: glass?.forKey };
}

/**
 * Finds the lowest point in the left and right thirds of the car (the tyres)
 * and returns the rotation that puts them level. Only meaningful for side,
 * front and rear shots; anything over 6 degrees is treated as perspective,
 * not camera tilt, and ignored.
 */
function levelAngle(a: Uint8Array, w: number, b: BBox): number {
  const low = (from: number, to: number) => {
    let best: [number, number] | null = null;
    for (let x = from; x < to; x++) {
      for (let y = b.bottom; y >= b.y; y--) {
        if (a[y * w + x] > 128) {
          if (!best || y > best[1]) best = [x, y];
          break;
        }
      }
    }
    return best;
  };
  const L = low(b.x, b.x + Math.round(b.w * 0.35));
  const R = low(b.x + Math.round(b.w * 0.65), b.x + b.w);
  if (!L || !R || R[0] - L[0] < b.w * 0.4) return 0;
  const deg = (Math.atan2(R[1] - L[1], R[0] - L[0]) * 180) / Math.PI;
  return Math.abs(deg) > 6 ? 0 : -deg;
}

/** True when the mask looks like a whole car rather than a close-up (mirror, wheel, badge). */
export async function looksLikeWholeCar(mask: Blob): Promise<boolean> {
  const bmp = await createImageBitmap(mask);
  const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  bmp.close();
  const a = await maskAlpha(mask, w, h);
  const b = findBBox(a, w, h);
  if (!b) return false;
  let area = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > 128) area++;
  const edge = (v: number, max: number) => v <= 2 || v >= max - 3;
  const touches = [edge(b.x, w), edge(b.x + b.w, w), edge(b.y, h), edge(b.y + b.h, h)].filter(Boolean).length;
  return area / (w * h) > 0.08 && b.w / b.h > 0.75 && touches < 2;
}

/** Rotates a canvas about its centre onto a canvas big enough to hold it. */
function rotated(c: Canvas, deg: number): Canvas {
  const r = (deg * Math.PI) / 180, cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
  const [out, ctx] = makeCanvas(c.width * cos + c.height * sin, c.width * sin + c.height * cos);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(r);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

function alphaOf(c: Canvas): Uint8Array {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
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
  const w = W * s.watermarkSize, h = (logo.height / logo.width) * w, m = W * 0.03;
  const pos = s.logoPos ?? "top-right";
  const x = pos.endsWith("right") ? W - w - m : m;
  const y = pos.startsWith("top") ? m : H - h - m;
  ctx.globalAlpha = 0.95;
  ctx.drawImage(logo, x, y, w, h);
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
  const polys = edit.glass ?? [];
  // AI windows only count if they were made for the outlines as they are now.
  if (edit.glassAi && prep.glassFix && polys.length && prep.glassFixFor === glassKey(polys)) pasteGlass(wctx, work.width, work.height, prep.glassFix, polys);
  if (edit.enhance) enhance(wctx, work.width, work.height, prep.lut);
  reduceGlare(wctx, work.width, work.height, edit.glare ?? 0, edit.removeBg ? prep.alpha : null);
  tintGlass(wctx, work.width, work.height, polys, edit.glassTint ?? 0);

  const [out, ctx] = makeCanvas(W, H);

  if (!edit.removeBg || !prep.alpha || !prep.bbox) {
    if (edit.removeBg && !prep.alpha) throw new Error("No cut-out yet. Process the photo first.");
    if (edit.removeBg && !prep.bbox) throw new Error("No car found in this photo.");
    const angle = edit.rotate ?? 0;
    if (angle) {
      // Rotate about the centre and zoom just enough that no corner shows.
      const r = (Math.abs(angle) * Math.PI) / 180;
      const zoom = Math.cos(r) + Math.sin(r) * Math.max(W / H, H / W);
      ctx.translate(W / 2, H / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      ctx.translate(-W / 2, -H / 2);
      drawCover(ctx, work, W, H);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else drawCover(ctx, work, W, H);
    if (edit.watermark) await watermark(ctx, W, H, s);
    return out;
  }

  // Cut the car out.
  const img = wctx.getImageData(0, 0, work.width, work.height);
  for (let i = 0, p = 3; i < prep.alpha.length; i++, p += 4) img.data[p] = prep.alpha[i];
  wctx.putImageData(img, 0, 0);

  // Straighten: auto-level from the tyres, plus any manual nudge.
  const angle = (edit.level ? prep.levelAngle : 0) + (edit.rotate ?? 0);
  let layer: Canvas = work;
  let b = prep.bbox;
  if (Math.abs(angle) > 0.05) {
    layer = rotated(work, angle);
    b = findBBox(alphaOf(layer), layer.width, layer.height) ?? b;
  }

  const { bd } = await getBackdrop(edit.background);
  const k = Math.min((W * 0.8) / b.w, (H * 0.64) / b.h) * edit.scale;
  const dw = layer.width * k, dh = layer.height * k;
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
  cctx.drawImage(layer, 0, 0, dw, dh);
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
