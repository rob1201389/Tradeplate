import { getSettings, listPhotos, putPhoto, uid } from "./db";
import { enqueue } from "./process";
import { SHOTS, shotDef } from "./shots";
import { thumbnail } from "./canvas";
import type { EditSettings, Photo, Settings } from "./types";

export function defaultEdit(slot: string, s: Settings): EditSettings {
  const def = shotDef(slot);
  const exterior = def ? def.exterior : false;
  return {
    removeBg: exterior,
    background: s.defaultBackground,
    scale: 1,
    offsetY: 0,
    shadow: true,
    reflection: false,
    enhance: true,
    plateMode: def?.plate ? s.defaultPlateMode : "none",
    plateQuad: null,
    watermark: s.watermarkDefault && !!s.logo,
  };
}

async function newPhoto(vehicleId: string, slot: string, file: Blob, order: number, s: Settings): Promise<Photo> {
  return {
    id: uid(),
    vehicleId,
    slot,
    order,
    original: file,
    edit: defaultEdit(slot, s),
    thumb: await thumbnail(file),
    status: "new",
    updatedAt: Date.now(),
  };
}

const slotOrder = (slot: string) => {
  const i = SHOTS.findIndex((s) => s.id === slot);
  return i < 0 ? 1000 : i * 10;
};

/** Adds photos to one slot (or as extras) and starts processing them. */
export async function addPhotos(vehicleId: string, slot: string, files: Blob[]) {
  const s = await getSettings();
  const existing = await listPhotos(vehicleId);
  let order = slot === "extra" ? Math.max(1000, ...existing.map((p) => p.order)) + 1 : slotOrder(slot);
  const ids: string[] = [];
  for (const f of files) {
    const p = await newPhoto(vehicleId, slot, f, order++, s);
    await putPhoto(p);
    ids.push(p.id);
  }
  enqueue(ids);
}

/** Drops a batch into the empty slots in shot-list order; anything left over becomes extras. */
export async function addBatch(vehicleId: string, files: Blob[]) {
  const s = await getSettings();
  const existing = await listPhotos(vehicleId);
  const taken = new Set(existing.map((p) => p.slot));
  const free = SHOTS.filter((d) => !taken.has(d.id)).map((d) => d.id);
  let extraOrder = Math.max(1000, ...existing.map((p) => p.order)) + 1;
  const ids: string[] = [];
  for (const f of files) {
    const slot = free.shift() ?? "extra";
    const p = await newPhoto(vehicleId, slot, f, slot === "extra" ? extraOrder++ : slotOrder(slot), s);
    await putPhoto(p);
    ids.push(p.id);
  }
  enqueue(ids);
}

export async function replaceOriginal(p: Photo, file: Blob) {
  await putPhoto({ ...p, original: file, mask: undefined, output: undefined, thumb: await thumbnail(file), status: "new", edit: { ...p.edit, plateQuad: null } });
  enqueue([p.id]);
}
