import { getPhoto, getSettings, getVehicle, listPhotos, putPhoto, uid } from "./db";
import { enqueue } from "./process";
import { LEVEL_SHOTS, SHOTS, shotDef } from "./shots";
import { thumbnail } from "./canvas";
import { BUILTIN } from "./backgrounds";
import type { EditSettings, Photo, Settings, Vehicle } from "./types";

export function defaultEdit(slot: string, s: Settings, v?: Vehicle): EditSettings {
  const def = shotDef(slot);
  const exterior = def ? def.exterior : false;
  const background = v?.look?.background ?? s.defaultBackground;
  return {
    removeBg: exterior,
    background,
    scale: 1,
    offsetY: 0,
    shadow: true,
    reflection: BUILTIN.find((b) => b.id === background)?.glossy ?? false,
    enhance: true,
    plateMode: def?.plate ? s.defaultPlateMode : "none",
    plateQuad: null,
    watermark: !!s.logo && (v?.look?.watermark ?? s.watermarkDefault),
    level: LEVEL_SHOTS.has(slot),
    rotate: 0,
  };
}

async function newPhoto(vehicleId: string, slot: string, file: Blob, order: number, s: Settings): Promise<Photo> {
  const v = await getVehicle(vehicleId);
  return {
    id: uid(),
    vehicleId,
    slot,
    order,
    original: file,
    edit: defaultEdit(slot, s, v),
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

/**
 * Moves a photo to another shot. If that shot already has a photo, the two
 * swap. Staging, plate cover and levelling follow the new shot type.
 */
export async function moveToSlot(photoId: string, slot: string) {
  const p = await getPhoto(photoId);
  if (!p || p.slot === slot) return;
  const s = await getSettings();
  const all = await listPhotos(p.vehicleId);
  const retarget = (ph: Photo, to: string, order: number): Photo => {
    const d = shotDef(to);
    return {
      ...ph,
      slot: to,
      order,
      edit: {
        ...ph.edit,
        removeBg: d ? d.exterior : ph.edit.removeBg,
        plateMode: d && !d.plate ? "none" : ph.edit.plateMode === "none" && d?.plate ? s.defaultPlateMode : ph.edit.plateMode,
        level: LEVEL_SHOTS.has(to),
      },
      status: "new",
    };
  };
  const other = slot === "extra" ? undefined : all.find((x) => x.slot === slot);
  const newOrder = slot === "extra" ? Math.max(1000, ...all.map((x) => x.order)) + 1 : slotOrder(slot);
  await putPhoto(retarget(p, slot, newOrder));
  if (other) await putPhoto(retarget(other, p.slot, p.slot === "extra" ? Math.max(1000, ...all.map((x) => x.order)) + 2 : slotOrder(p.slot)));
  enqueue([p.id, ...(other ? [other.id] : [])]);
}

/** Applies a vehicle-wide backdrop and logo choice to every photo and re-renders. */
export async function applyLook(v: Vehicle, look: { background: string; watermark: boolean }) {
  const s = await getSettings();
  const glossy = BUILTIN.find((b) => b.id === look.background)?.glossy ?? false;
  const photos = await listPhotos(v.id);
  for (const p of photos) {
    await putPhoto({ ...p, edit: { ...p.edit, background: look.background, reflection: glossy, watermark: look.watermark && !!s.logo }, status: p.mask || !p.edit.removeBg ? p.status : "new" });
  }
  enqueue(photos.map((p) => p.id));
}
