// Background job queue: cut out, render, thumbnail. Lives at module level so it
// keeps going while the user moves between screens.
import { getPhoto, getSettings, putPhoto } from "./db";
import { compose, outputSize, prepare } from "./render";
import { segment } from "./segment";
import { looksLikeWholeCar } from "./render";
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

// Photos changed while being processed; they go round again so the newest settings win.
const rerun = new Set<string>();

export function enqueue(ids: string[]) {
  for (const id of ids) {
    if (current === id) rerun.add(id);
    else if (!queue.includes(id)) queue.push(id);
  }
  notify();
  void run();
}

async function run() {
  if (running) return;
  running = true;
  while (queue.length) {
    current = queue.shift()!;
    notify();
    await processPhoto(current);
    if (rerun.delete(current) && !queue.includes(current)) queue.push(current);
  }
  current = null;
  running = false;
  notify();
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Cuts out (if needed) and renders one photo. Reads the photo fresh, and when
 * saving merges into whatever is in the database by then, so a backdrop or
 * logo change made mid-render is never overwritten by a stale copy.
 */
export async function processPhoto(id: string) {
  const s = await getSettings();
  const start = await getPhoto(id);
  if (!start) return;
  try {
    await putPhoto({ ...start, status: "processing", error: undefined });
    let mask = start.mask;
    let edit = start.edit;
    if (edit.removeBg && !mask) {
      mask = await segment(start.original, s);
      // A close-up (mirror, wheel, badge) in an exterior slot: show it as shot, don't stage it.
      if (!(await looksLikeWholeCar(mask))) edit = { ...edit, removeBg: false };
    }
    const rendered = await render(start.original, mask, edit, start);
    const latest = await getPhoto(id);
    if (!latest) return;
    // Retaken while this ran (blobs come back as new objects on every read, so compare contents).
    if (latest.original.size !== start.original.size || latest.original.type !== start.original.type) {
      rerun.add(id);
      return;
    }
    if (!same(latest.edit, start.edit)) {
      // Settings changed while this ran: keep the cut-out, render again with the new ones.
      await putPhoto({ ...latest, mask, status: "new" });
      rerun.add(id);
      return;
    }
    await putPhoto({ ...latest, mask, edit, ...rendered, status: "done", error: undefined });
  } catch (e) {
    const latest = (await getPhoto(id)) ?? start;
    await putPhoto({ ...latest, status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

async function render(original: Blob, mask: Blob | undefined, edit: Photo["edit"], p: Pick<Photo, "glassFix" | "glassFixFor">) {
  const s = await getSettings();
  const prep = await prepare(original, mask, WORK_EDGE, { fix: p.glassFix, forKey: p.glassFixFor });
  const { W, H } = outputSize(s);
  const output = await toJpeg(await compose(prep, edit, s, W, H), s.jpegQuality);
  return { output, thumb: await thumbnail(output) };
}

/** Saves an edit made in the editor and renders it straight away. */
export async function renderAndStore(p: Photo) {
  const rendered = await render(p.original, p.mask, p.edit, p);
  const latest = (await getPhoto(p.id)) ?? p;
  await putPhoto({ ...latest, edit: p.edit, mask: latest.mask ?? p.mask, ...rendered, status: "done", error: undefined });
}
