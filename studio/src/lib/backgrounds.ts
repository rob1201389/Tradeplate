// Showroom backdrops drawn in code, so there are no image licences to worry
// about and they render sharp at any size.
//
// Built-in backdrops are a wall plus a floor platform whose back edge (the
// "seam") is placed per photo, about halfway up the car. That puts floor
// behind the far wheels in a 3/4 shot, which is what stops a car looking like
// it is hovering in front of a wall.
import { db } from "./db";
import { decode, drawCover, makeCanvas, type Canvas, type Ctx } from "./canvas";

export interface Backdrop {
  id: string;
  name: string;
  /** Where the lowest tyre sits, as a fraction of height. */
  ground: number;
  glossy: boolean;
  /** Built-in backdrops draw their floor around the car; uploads are fixed photos. */
  auto: boolean;
  custom?: boolean;
}

export const BUILTIN: Backdrop[] = [
  { id: "studio-white", name: "White showroom", ground: 0.86, glossy: true, auto: true },
  { id: "studio-grey", name: "Grey studio", ground: 0.86, glossy: true, auto: true },
  { id: "showroom-dark", name: "Dark showroom", ground: 0.86, glossy: true, auto: true },
  { id: "showroom-warm", name: "Warm showroom", ground: 0.86, glossy: true, auto: true },
  { id: "loft", name: "Concrete loft", ground: 0.86, glossy: false, auto: true },
  { id: "plain-white", name: "Plain white", ground: 0.86, glossy: false, auto: false },
];

interface Look {
  wall: [string, string];
  floor: [string, string];
  rim: string;
  light: string;
  lightAlpha: number;
  vignette: number;
  noise: number;
  panels?: boolean;
}

const LOOKS: Record<string, Look> = {
  "studio-white": { wall: ["#f7f7f7", "#e4e4e4"], floor: ["#e2e3e5", "#a9abae"], rim: "rgba(26,26,26,0.85)", light: "255,255,255", lightAlpha: 0.7, vignette: 0.1, noise: 0.02 },
  "studio-grey": { wall: ["#7c8086", "#5a5e64"], floor: ["#6a6d72", "#33363a"], rim: "rgba(15,15,15,0.9)", light: "255,255,255", lightAlpha: 0.18, vignette: 0.3, noise: 0.04 },
  "showroom-dark": { wall: ["#1a1b1e", "#0e0f11"], floor: ["#2a2c30", "#0b0c0d"], rim: "rgba(0,0,0,0.95)", light: "235,240,255", lightAlpha: 0.08, vignette: 0.2, noise: 0.05, panels: true },
  "showroom-warm": { wall: ["#e3d9cc", "#cbbfae"], floor: ["#a39789", "#5d554d"], rim: "rgba(40,30,20,0.85)", light: "255,244,225", lightAlpha: 0.35, vignette: 0.25, noise: 0.04 },
  loft: { wall: ["#a6a29c", "#8d8a85"], floor: ["#86827c", "#4b4844"], rim: "rgba(30,28,26,0.85)", light: "255,255,255", lightAlpha: 0.18, vignette: 0.3, noise: 0.12 },
};

let noiseTile: Canvas | null = null;
function noise(ctx: Ctx, W: number, H: number, alpha: number) {
  if (alpha <= 0) return;
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

function glow(ctx: Ctx, x: number, y: number, rx: number, ry: number, rgb: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/**
 * Wall, then a wide elliptical platform. Its back edge sits at `seam` in the
 * middle and curves down towards the sides, like a turntable floor.
 */
function paintShowroom(ctx: Ctx, W: number, H: number, ground: number, seam: number, look: Look) {
  const gy = ground * H, sy = seam * H;
  ctx.fillStyle = vgrad(ctx, 0, sy, [[0, look.wall[0]], [1, look.wall[1]]]);
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W / 2, sy * 0.75, W * 0.55, sy * 0.8, look.light, look.lightAlpha * 0.6);

  if (look.panels) {
    const n = 5, pw = W * 0.06, top = sy * 0.12, bottom = sy * 0.92;
    for (let i = 0; i < n; i++) {
      const x = W * (0.1 + (0.8 * i) / (n - 1)) - pw / 2;
      ctx.fillStyle = vgrad(ctx, top, bottom, [[0, "rgba(235,240,255,0.04)"], [0.5, "rgba(235,240,255,0.5)"], [1, "rgba(235,240,255,0.04)"]]);
      ctx.fillRect(x, top, pw, bottom - top);
    }
  }

  const rx = W * 1.25, ry = (H - sy) * 1.6, cy = sy + ry;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(W / 2, cy, rx, ry, 0, 0, Math.PI * 2);
  const fg = ctx.createRadialGradient(W / 2, gy, 0, W / 2, gy, W * 0.75);
  fg.addColorStop(0, look.floor[0]);
  fg.addColorStop(1, look.floor[1]);
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.clip();
  glow(ctx, W / 2, gy, W * 0.5, (H - sy) * 0.6, look.light, look.lightAlpha * 0.5);
  if (look.panels) {
    // The wall lights streak across a polished floor.
    for (let i = 0; i < 5; i++) {
      const x = W * (0.1 + (0.8 * i) / 4) - W * 0.03;
      ctx.fillStyle = vgrad(ctx, sy, H, [[0, "rgba(235,240,255,0.16)"], [1, "rgba(235,240,255,0)"]]);
      ctx.fillRect(x, sy, W * 0.06, H - sy);
    }
  }
  ctx.restore();

  // Platform edge, strongest at the sides where the car doesn't cover it.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(W / 2, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.lineWidth = Math.max(2, H * 0.007);
  ctx.strokeStyle = look.rim;
  ctx.stroke();
  ctx.restore();

  const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  noise(ctx, W, H, look.noise);
}

export async function allBackdrops(): Promise<Backdrop[]> {
  const custom = await (await db()).getAll("backgrounds");
  return [...BUILTIN, ...custom.map((c) => ({ id: c.id, name: c.name, ground: c.floorLine, glossy: c.glossy, auto: false, custom: true }))];
}

export async function getBackdrop(id: string): Promise<{ bd: Backdrop; image?: Blob }> {
  const b = BUILTIN.find((x) => x.id === id);
  if (b) return { bd: b };
  const c = await (await db()).get("backgrounds", id);
  if (c) return { bd: { id: c.id, name: c.name, ground: c.floorLine, glossy: c.glossy, auto: false, custom: true }, image: c.image };
  return { bd: BUILTIN[0] };
}

const cache = new Map<string, Canvas>();

/** `seam` is where the floor meets the wall, as a fraction of height. */
export async function renderBackdrop(id: string, W: number, H: number, seam = 0.55, ground?: number): Promise<{ canvas: Canvas; bd: Backdrop }> {
  const { bd, image } = await getBackdrop(id);
  const g = ground ?? bd.ground;
  const key = `${bd.id}:${W}x${H}:${g.toFixed(3)}:${bd.auto ? seam.toFixed(3) : ""}`;
  let canvas = cache.get(key);
  if (!canvas) {
    const [c, ctx] = makeCanvas(W, H);
    if (image) drawCover(ctx, await decode(image, Math.max(W, H)), W, H);
    else if (bd.id === "plain-white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
    } else paintShowroom(ctx, W, H, g, seam, LOOKS[bd.id]);
    canvas = c;
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
    cache.set(key, canvas);
  }
  return { canvas, bd };
}

export function clearBackdropCache() {
  cache.clear();
}
