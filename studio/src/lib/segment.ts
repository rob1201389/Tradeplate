// Produces a car mask from a photo, either on this device or on a processing server.
import type { Settings } from "./types";

export interface Mask {
  width: number;
  height: number;
  /** One byte per pixel, 255 = car. */
  data: Uint8Array;
}

/** Long edge sent to the model. It works at 1024 internally; a bit more keeps edges clean when scaled back up. */
const SEG_EDGE = 1600;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
type ProgressFn = (loaded: number, total: number) => void;
const progressListeners = new Set<ProgressFn>();
const fileProgress = new Map<string, [number, number]>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./segment.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") {
      fileProgress.set(m.file, [m.loaded, m.total]);
      let l = 0, t = 0;
      for (const [a, b] of fileProgress.values()) { l += a; t += b; }
      progressListeners.forEach((fn) => fn(l, t));
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.ok ? p.resolve(m) : p.reject(new Error(m.error));
  };
  return worker;
}

function call(type: "load" | "mask", image?: Blob): Promise<any> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, image });
  });
}

export function onModelProgress(fn: ProgressFn) {
  progressListeners.add(fn);
  return () => void progressListeners.delete(fn);
}

/** Downloads and warms the on-device model. Returns the backend in use. */
export async function preloadDeviceModel(): Promise<string> {
  return (await call("load")).device;
}

export function serverBase(s: Settings) {
  return s.serverUrl.trim().replace(/\/+$/, "");
}

let sameOriginServer: Promise<boolean> | null = null;
export async function serverReachable(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return r.ok && (await r.json()).ok === true;
  } catch {
    return false;
  }
}

/** Which engine will actually run, given the setting and what is reachable. */
export async function resolveEngine(s: Settings): Promise<{ kind: "device" } | { kind: "server"; base: string }> {
  if (s.engine === "device") return { kind: "device" };
  if (serverBase(s)) {
    if (s.engine === "server" || (await serverReachable(serverBase(s)))) return { kind: "server", base: serverBase(s) };
  }
  if (s.engine === "server" || s.engine === "auto") {
    // Served by our own Node server? Then use it.
    sameOriginServer ??= location.protocol.startsWith("http") ? serverReachable(".") : Promise.resolve(false);
    if (await sameOriginServer) return { kind: "server", base: "." };
  }
  if (s.engine === "server") throw new Error("Processing server not reachable. Check the address in Settings.");
  return { kind: "device" };
}

async function downscale(src: Blob, edge: number): Promise<Blob> {
  const bmp = await createImageBitmap(src);
  const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return c.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

async function pngToMask(png: Blob): Promise<Mask> {
  const bmp = await createImageBitmap(png);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const data = new Uint8Array(bmp.width * bmp.height);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4];
  bmp.close();
  return { width: c.width, height: c.height, data };
}

export async function maskToPng(m: Mask): Promise<Blob> {
  const c = new OffscreenCanvas(m.width, m.height);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(m.width, m.height);
  for (let i = 0; i < m.data.length; i++) {
    const v = m.data[i];
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.convertToBlob({ type: "image/png" });
}

export async function loadMaskPng(png: Blob) {
  return pngToMask(png);
}

/** Returns a cleaned mask PNG for the photo. */
export async function segment(photo: Blob, s: Settings): Promise<Blob> {
  const small = await downscale(photo, SEG_EDGE);
  const engine = await resolveEngine(s);
  let mask: Mask;
  if (engine.kind === "server") {
    const r = await fetch(`${engine.base}/api/mask`, { method: "POST", body: small, headers: { "Content-Type": "image/jpeg", ...(s.serverKey ? { Authorization: `Bearer ${s.serverKey}` } : {}) } });
    if (!r.ok) throw new Error(`Server: ${r.status} ${await r.text()}`);
    mask = await pngToMask(await r.blob());
  } else {
    const m = await call("mask", small);
    mask = { width: m.width, height: m.height, data: m.data };
  }
  return maskToPng(cleanMask(mask));
}

/**
 * Drops stray blobs (people, bins, other cars' edges) by keeping the largest
 * connected region plus anything at least a fifth its size, and firms up the
 * semi-transparent haze the model leaves around glass.
 */
export function cleanMask(m: Mask): Mask {
  const { width: w, height: h, data } = m;
  // Low threshold so a region's soft edge belongs to it.
  const T = 32;
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] < T || labels[i]) continue;
    const label = sizes.length;
    let size = 0;
    stack.push(i);
    labels[i] = label;
    while (stack.length) {
      const p = stack.pop()!;
      if (data[p] >= 128) size++;
      const x = p % w;
      if (x > 0 && !labels[p - 1] && data[p - 1] >= T) { labels[p - 1] = label; stack.push(p - 1); }
      if (x < w - 1 && !labels[p + 1] && data[p + 1] >= T) { labels[p + 1] = label; stack.push(p + 1); }
      if (p >= w && !labels[p - w] && data[p - w] >= T) { labels[p - w] = label; stack.push(p - w); }
      if (p + w < data.length && !labels[p + w] && data[p + w] >= T) { labels[p + w] = label; stack.push(p + w); }
    }
    sizes.push(size);
  }
  const biggest = Math.max(0, ...sizes);
  const keep = sizes.map((s) => s > 0 && s >= biggest * 0.2);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if (labels[i] && keep[labels[i]]) out[i] = Math.max(0, Math.min(255, Math.round((data[i] - 20) * 1.15)));
  }
  return { width: w, height: h, data: out };
}
