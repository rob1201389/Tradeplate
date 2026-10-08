// Glare and glass handling.
//
// Reduce glare and Darken glass only adjust pixels the camera captured, so
// they can't invent or hide anything. AI clean-up repaints the marked windows
// through a paid service; only pixels inside the window outlines are ever
// taken from its result, so paint (and any damage on it) stays as shot.
import { makeCanvas, supportsFilter, type Canvas, type Ctx } from "./canvas";
import type { Point, Settings } from "./types";

const luma = (r: number, g: number, b: number) => r * 0.299 + g * 0.587 + b * 0.114;

/**
 * Tones down specular hotspots: pixels well above both a brightness floor and
 * their surroundings. Comparing with a blurred copy means a white car stays
 * white; only the sharp bright patches on it come down.
 */
export function reduceGlare(ctx: Ctx, w: number, h: number, strength: number, alpha: Uint8Array | null) {
  if (strength <= 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // Cheap wide blur: shrink then stretch.
  const sw = Math.max(8, Math.round(w / 32)), sh = Math.max(8, Math.round(h / 32));
  const [small, sctx] = makeCanvas(sw, sh);
  sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
  const [big, bctx] = makeCanvas(w, h);
  bctx.drawImage(small, 0, 0, w, h);
  const b = bctx.getImageData(0, 0, w, h).data;
  big.width = 0;
  const floor = 195;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (alpha && alpha[p] < 16) continue;
    const L = luma(d[i], d[i + 1], d[i + 2]);
    if (L <= floor) continue;
    const ref = Math.max(floor, luma(b[i], b[i + 1], b[i + 2]) + 16);
    const excess = L - ref;
    if (excess <= 0) continue;
    const k = (L - strength * 0.85 * excess) / L;
    d[i] *= k;
    d[i + 1] *= k;
    d[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
}

/** White-on-transparent window mask with a soft edge, at w x h. */
export function glassMask(polys: Point[][], w: number, h: number, feather = true): Canvas {
  const [c, ctx] = makeCanvas(w, h);
  if (feather && supportsFilter()) ctx.filter = `blur(${Math.max(1, Math.round(Math.min(w, h) * 0.003))}px)`;
  ctx.fillStyle = "#fff";
  for (const poly of polys) {
    if (poly.length < 3) continue;
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

/** Copies the AI result into the photo, inside the window outlines only. */
export function pasteGlass(ctx: Ctx, w: number, h: number, fixed: Canvas, polys: Point[][]) {
  const [layer, lctx] = makeCanvas(w, h);
  lctx.drawImage(fixed, 0, 0, w, h);
  lctx.globalCompositeOperation = "destination-in";
  lctx.drawImage(glassMask(polys, w, h), 0, 0);
  ctx.drawImage(layer, 0, 0);
}

/**
 * Darkens the marked windows towards a smoked tint, keeping a little of what
 * was there, and lays a soft studio sheen across the top of each.
 */
export function tintGlass(ctx: Ctx, w: number, h: number, polys: Point[][], strength: number) {
  if (strength <= 0 || !polys.some((p) => p.length >= 3)) return;
  const m = glassMask(polys, w, h).getContext("2d")!.getImageData(0, 0, w, h).data;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const tint = [18, 21, 25];
  for (let i = 0; i < d.length; i += 4) {
    const a = m[i + 3];
    if (!a) continue;
    const s = (strength * 0.85 * a) / 255;
    for (let c = 0; c < 3; c++) d[i + c] = tint[c] + (d[i + c] - tint[c]) * (1 - s);
  }
  ctx.putImageData(img, 0, 0);
  // Sheen: a soft light band across the top of each window, like a studio softbox.
  ctx.save();
  for (const poly of polys) {
    if (poly.length < 3) continue;
    const ys = poly.map((p) => p[1] * h);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, top, 0, top + (bottom - top) * 0.6);
    g.addColorStop(0, `rgba(255,255,255,${0.16 * strength})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, bottom - top);
    ctx.restore();
  }
  ctx.restore();
}

export const glassKey = (polys: Point[][] | undefined) => JSON.stringify((polys ?? []).map((p) => p.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])));

/** Long edge sent to the AI service; well inside its 9.4 MP limit. */
const AI_EDGE = 2048;

/**
 * Sends the photo and a window mask to the AI service (a route on the
 * Car Studio server or the site's worker, which holds the provider key).
 */
export async function aiCleanGlass(original: Blob, polys: Point[][], s: Settings): Promise<Blob> {
  if (!polys.some((p) => p.length >= 3)) throw new Error("Mark the windows first.");
  const bmp = await createImageBitmap(original, { imageOrientation: "from-image" });
  const k = Math.min(1, AI_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const [img, ictx] = makeCanvas(w, h);
  ictx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const [mask, mctx] = makeCanvas(w, h);
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, w, h);
  mctx.drawImage(glassMask(polys, w, h, false), 0, 0);
  const form = new FormData();
  form.append("image", await img.convertToBlob({ type: "image/jpeg", quality: 0.93 }), "image.jpg");
  form.append("mask", await mask.convertToBlob({ type: "image/png" }), "mask.png");
  const base = s.aiUrl.trim().replace(/\/+$/, "") || ".";
  const r = await fetch(`${base}/api/glass`, { method: "POST", body: form, headers: s.aiKey ? { "X-Photoai-Key": s.aiKey } : {} });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    if (r.status === 401) throw new Error("AI glass: access key missing or wrong. Set it in Settings.");
    if (r.status === 503) throw new Error("AI glass isn't set up on the server yet.");
    if (r.status === 429) throw new Error("AI glass: daily limit reached. Try again tomorrow.");
    throw new Error(`AI glass failed (${r.status}). ${msg.slice(0, 160)}`);
  }
  return r.blob();
}
