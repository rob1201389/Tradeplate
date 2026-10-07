// Studio backdrops drawn in code, so there are no image licences to worry about
// and they render sharp at any output size.
import { db } from "./db";
import { decode, drawCover, makeCanvas, type Canvas, type Ctx } from "./canvas";

export interface Backdrop {
  id: string;
  name: string;
  /** Where the tyres sit, as a fraction of height. */
  ground: number;
  glossy: boolean;
  custom?: boolean;
}

export const BUILTIN: Backdrop[] = [
  { id: "studio-white", name: "White studio", ground: 0.84, glossy: false },
  { id: "studio-grey", name: "Grey studio", ground: 0.84, glossy: true },
  { id: "showroom-dark", name: "Dark showroom", ground: 0.83, glossy: true },
  { id: "showroom-warm", name: "Warm showroom", ground: 0.84, glossy: true },
  { id: "loft", name: "Concrete loft", ground: 0.84, glossy: false },
  { id: "plain-white", name: "Plain white", ground: 0.86, glossy: false },
];

let noiseTile: Canvas | null = null;
function noise(ctx: Ctx, W: number, H: number, alpha: number) {
  if (!noiseTile) {
    const [c, nctx] = makeCanvas(256, 256);
    const img = nctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    noiseTile = c;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(noiseTile, "repeat")!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function vgrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function glow(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color.replace("A", String(alpha)));
  g.addColorStop(1, color.replace("A", "0"));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** Wall and floor joined by a soft cove, the way a real infinity cove reads. */
function cove(ctx: Ctx, W: number, H: number, seam: number, wall: [string, string], floor: [string, string]) {
  const band = 0.05;
  ctx.fillStyle = vgrad(ctx, 0, H, [
    [0, wall[0]],
    [Math.max(0.01, seam - band), wall[1]],
    [Math.min(0.99, seam + band), floor[0]],
    [1, floor[1]],
  ]);
  ctx.fillRect(0, 0, W, H);
}

function vignette(ctx: Ctx, W: number, H: number, alpha: number) {
  const g = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const painters: Record<string, (ctx: Ctx, W: number, H: number, ground: number) => void> = {
  "studio-white"(ctx, W, H, g) {
    cove(ctx, W, H, g - 0.16, ["#e9ecef", "#f6f7f9"], ["#eef0f2", "#d5d9de"]);
    glow(ctx, W / 2, g * H, W * 0.55, H * 0.2, "rgba(255,255,255,A)", 0.7);
    vignette(ctx, W, H, 0.12);
  },
  "studio-grey"(ctx, W, H, g) {
    cove(ctx, W, H, g - 0.17, ["#4a4f57", "#727881"], ["#5c6168", "#2c2f34"]);
    glow(ctx, W / 2, H * 0.4, W * 0.5, H * 0.38, "rgba(255,255,255,A)", 0.16);
    glow(ctx, W / 2, g * H, W * 0.5, H * 0.12, "rgba(255,255,255,A)", 0.12);
    vignette(ctx, W, H, 0.35);
    noise(ctx, W, H, 0.04);
  },
  "showroom-dark"(ctx, W, H, g) {
    const seam = (g - 0.15) * H;
    ctx.fillStyle = vgrad(ctx, 0, seam, [[0, "#0c0d0f"], [1, "#1b1d21"]]);
    ctx.fillRect(0, 0, W, seam);
    ctx.fillStyle = vgrad(ctx, seam, H, [[0, "#1d1f23"], [1, "#08090a"]]);
    ctx.fillRect(0, seam, W, H - seam);
    // Light panels on the back wall, and their streaks on the polished floor.
    const n = 5, pw = W * 0.07, top = H * 0.1, bottom = seam - H * 0.06;
    for (let i = 0; i < n; i++) {
      const x = W * (0.1 + (0.8 * i) / (n - 1)) - pw / 2;
      ctx.fillStyle = vgrad(ctx, top, bottom, [[0, "rgba(255,255,255,0.05)"], [0.5, "rgba(235,240,255,0.55)"], [1, "rgba(255,255,255,0.05)"]]);
      ctx.fillRect(x, top, pw, bottom - top);
      ctx.fillStyle = vgrad(ctx, seam, H, [[0, "rgba(235,240,255,0.18)"], [1, "rgba(235,240,255,0)"]]);
      ctx.fillRect(x, seam, pw, H - seam);
    }
    glow(ctx, W / 2, g * H, W * 0.5, H * 0.1, "rgba(255,255,255,A)", 0.08);
    noise(ctx, W, H, 0.05);
  },
  "showroom-warm"(ctx, W, H, g) {
    cove(ctx, W, H, g - 0.17, ["#bfb2a2", "#ddd3c6"], ["#8a7f74", "#4f4740"]);
    glow(ctx, W / 2, H * 0.38, W * 0.55, H * 0.35, "rgba(255,244,225,A)", 0.35);
    vignette(ctx, W, H, 0.3);
    noise(ctx, W, H, 0.04);
  },
  loft(ctx, W, H, g) {
    cove(ctx, W, H, g - 0.17, ["#8d8a85", "#a6a29c"], ["#77736d", "#4b4844"]);
    // Formwork panel joints.
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = Math.max(1, W / 1200);
    const seam = (g - 0.17) * H;
    for (let y = seam / 3; y < seam - 2; y += seam / 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = W / 6; x < W; x += W / 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, seam - H * 0.04); ctx.stroke(); }
    glow(ctx, W / 2, H * 0.42, W * 0.6, H * 0.4, "rgba(255,255,255,A)", 0.18);
    vignette(ctx, W, H, 0.3);
    noise(ctx, W, H, 0.12);
  },
  "plain-white"(ctx, W, H) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
  },
};

export async function allBackdrops(): Promise<Backdrop[]> {
  const custom = await (await db()).getAll("backgrounds");
  return [...BUILTIN, ...custom.map((c) => ({ id: c.id, name: c.name, ground: c.floorLine, glossy: c.glossy, custom: true }))];
}

const cache = new Map<string, Canvas>();

export async function renderBackdrop(id: string, W: number, H: number): Promise<{ canvas: Canvas; bd: Backdrop }> {
  let bd = BUILTIN.find((b) => b.id === id);
  let customImg: Blob | undefined;
  if (!bd) {
    const c = await (await db()).get("backgrounds", id);
    if (c) {
      bd = { id: c.id, name: c.name, ground: c.floorLine, glossy: c.glossy, custom: true };
      customImg = c.image;
    } else bd = BUILTIN[0];
  }
  const key = `${bd.id}:${W}x${H}:${bd.ground}`;
  let canvas = cache.get(key);
  if (!canvas) {
    const [c, ctx] = makeCanvas(W, H);
    if (customImg) drawCover(ctx, await decode(customImg, Math.max(W, H)), W, H);
    else painters[bd.id](ctx, W, H, bd.ground);
    canvas = c;
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
    cache.set(key, canvas);
  }
  return { canvas, bd };
}

export function clearBackdropCache() {
  cache.clear();
}
