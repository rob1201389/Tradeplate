// Covers the number plate: either a printed panel warped onto the plate in
// perspective, or pixelation.
import { decode, drawCover, makeCanvas, type Canvas, type Ctx } from "./canvas";
import type { Point, Settings } from "./types";

/** Standard Australian plate is 372 x 134 mm. */
const ART_W = 744, ART_H = 268;

let artKey = "";
let artCanvas: Canvas | null = null;

export async function plateArt(s: Settings): Promise<Canvas> {
  const key = `${s.plateText}|${s.plateBg}|${s.plateFg}|${s.plateImage?.size ?? 0}`;
  if (artCanvas && key === artKey) return artCanvas;
  const [c, ctx] = makeCanvas(ART_W, ART_H);
  if (s.plateImage) {
    drawCover(ctx, await decode(s.plateImage, ART_W * 2), ART_W, ART_H);
  } else {
    const r = 22;
    ctx.fillStyle = s.plateBg;
    ctx.beginPath();
    ctx.roundRect(0, 0, ART_W, ART_H, r);
    ctx.fill();
    ctx.strokeStyle = s.plateFg;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(14, 14, ART_W - 28, ART_H - 28, r - 8);
    ctx.stroke();
    const text = s.plateText.trim();
    if (text) {
      ctx.fillStyle = s.plateFg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 150;
      do {
        ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
        size -= 4;
      } while (ctx.measureText(text).width > ART_W - 90 && size > 30);
      ctx.fillText(text, ART_W / 2, ART_H / 2 + 6);
    }
  }
  artKey = key;
  artCanvas = c;
  return c;
}

/** Projective map from the unit square onto quad p0..p3 (TL, TR, BR, BL). */
function homography(q: Point[]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  return (u: number, v: number): Point => {
    const w = g * u + h * v + 1;
    return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w];
  };
}

function drawTriangle(ctx: Ctx, img: Canvas, s: Point[], d: Point[]) {
  const [s0, s1, s2] = s, [d0, d1, d2] = d;
  const ux = s1[0] - s0[0], uy = s1[1] - s0[1], vx = s2[0] - s0[0], vy = s2[1] - s0[1];
  const dux = d1[0] - d0[0], duy = d1[1] - d0[1], dvx = d2[0] - d0[0], dvy = d2[1] - d0[1];
  const det = ux * vy - vx * uy;
  if (Math.abs(det) < 1e-9) return;
  const a = (dux * vy - dvx * uy) / det, c = (dvx * ux - dux * vx) / det;
  const b = (duy * vy - dvy * uy) / det, dd = (dvy * ux - duy * vx) / det;
  const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b * s0[0] - dd * s0[1];
  // Grow the clip a fraction of a pixel so neighbouring triangles don't leave hairline seams.
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const grow = (p: Point): Point => {
    const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / l) * 0.6, p[1] + (dy / l) * 0.6];
  };
  ctx.save();
  ctx.beginPath();
  const [g0, g1, g2] = [grow(d0), grow(d1), grow(d2)];
  ctx.moveTo(g0[0], g0[1]);
  ctx.lineTo(g1[0], g1[1]);
  ctx.lineTo(g2[0], g2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function warpOnto(ctx: Ctx, art: Canvas, quad: Point[]) {
  const H = homography(quad);
  const N = 10;
  const W = art.width, Hh = art.height;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
      const s00: Point = [u0 * W, v0 * Hh], s10: Point = [u1 * W, v0 * Hh], s11: Point = [u1 * W, v1 * Hh], s01: Point = [u0 * W, v1 * Hh];
      const d00 = H(u0, v0), d10 = H(u1, v0), d11 = H(u1, v1), d01 = H(u0, v1);
      drawTriangle(ctx, art, [s00, s10, s11], [d00, d10, d11]);
      drawTriangle(ctx, art, [s00, s11, s01], [d00, d11, d01]);
    }
  }
}

export function pixelate(ctx: Ctx, src: Canvas, quad: Point[]) {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  const w = Math.ceil(Math.max(...xs)) - x, h = Math.ceil(Math.max(...ys)) - y;
  if (w < 2 || h < 2) return;
  const cells = Math.max(4, Math.round(w / Math.max(6, w / 14)));
  const [tiny, tctx] = makeCanvas(cells, Math.max(2, Math.round((cells * h) / w)));
  tctx.drawImage(src, x, y, w, h, 0, 0, tiny.width, tiny.height);
  ctx.save();
  ctx.beginPath();
  quad.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  // Pad by a cell so the clip edge never shows the original.
  const cw = w / tiny.width;
  ctx.drawImage(tiny, x - cw, y - cw, w + cw * 2, h + cw * 2);
  ctx.restore();
}

/** A sensible starting box: centred, low on the car's front or rear. */
export function defaultQuad(bbox: { x: number; y: number; w: number; h: number } | null, iw: number, ih: number): Point[] {
  const cx = bbox ? (bbox.x + bbox.w / 2) / iw : 0.5;
  const cy = bbox ? (bbox.y + bbox.h * 0.72) / ih : 0.65;
  const hw = bbox ? (bbox.w / iw) * 0.12 : 0.1;
  const hh = (hw * iw * (ART_H / ART_W)) / ih;
  return [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
}
