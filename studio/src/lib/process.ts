// Background job queue: cut out, render, thumbnail. Lives at module level so it
// keeps going while the user moves between screens.
import { getPhoto, getSettings, putPhoto } from "./db";
import { compose, outputSize, prepare } from "./render";
import { segment } from "./segment";
import { thumbnail, toJpeg } from "./canvas";
import type { Photo } from "./types";

/** Long edge the source is decoded at for the final render. */
export const WORK_EDGE = 2560;

const queue: string[] = [];
let running = false;
let current: string | null = null;
const listeners = new Set<() => void>();

export const queueState = () => ({ pending: queue.length, current });
export function onQueue(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const notify = () => listeners.forEach((f) => f());

export function enqueue(ids: string[]) {
  for (const id of ids) if (!queue.includes(id) && current !== id) queue.push(id);
  notify();
  void run();
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    current = queue.shift()!;
    notify();
    const p = await getPhoto(current);
    if (p) await processPhoto(p);
  }
  current = null;
  running = false;
  notify();
}

export async function processPhoto(p: Photo, opts: { remask?: boolean } = {}) {
  const s = await getSettings();
  try {
    await putPhoto({ ...p, status: "processing", error: undefined });
    if (p.edit.removeBg && (!p.mask || opts.remask)) p.mask = await segment(p.original, s);
    await renderAndStore(p);
  } catch (e) {
    await putPhoto({ ...p, status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export async function renderAndStore(p: Photo) {
  const s = await getSettings();
  const prep = await prepare(p.original, p.mask, WORK_EDGE);
  const { W, H } = outputSize(s);
  const out = await compose(prep, p.edit, s, W, H);
  p.output = await toJpeg(out, s.jpegQuality);
  p.thumb = await thumbnail(p.output);
  p.status = "done";
  p.error = undefined;
  await putPhoto(p);
}
