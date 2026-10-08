import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CustomBackground, Photo, Settings, Vehicle } from "./types";

interface StudioDB extends DBSchema {
  vehicles: { key: string; value: Vehicle; indexes: { updatedAt: number } };
  photos: { key: string; value: Photo; indexes: { vehicleId: string } };
  backgrounds: { key: string; value: CustomBackground };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<StudioDB>> | null = null;

export function db() {
  dbp ??= openDB<StudioDB>("car-studio", 1, {
    upgrade(d) {
      d.createObjectStore("vehicles", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      d.createObjectStore("photos", { keyPath: "id" }).createIndex("vehicleId", "vehicleId");
      d.createObjectStore("backgrounds", { keyPath: "id" });
      d.createObjectStore("kv");
    },
  });
  return dbp;
}

export const uid = () => crypto.randomUUID();

// Tiny change bus so lists refresh after background processing writes.
const listeners = new Set<() => void>();
export function onChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const emitChange = () => listeners.forEach((fn) => fn());

export async function listVehicles() {
  const all = await (await db()).getAllFromIndex("vehicles", "updatedAt");
  return all.reverse();
}
export const getVehicle = async (id: string) => (await db()).get("vehicles", id);
export async function putVehicle(v: Vehicle) {
  v.updatedAt = Date.now();
  await (await db()).put("vehicles", v);
  emitChange();
}
export async function deleteVehicle(id: string) {
  const d = await db();
  const tx = d.transaction(["vehicles", "photos"], "readwrite");
  const keys = await tx.objectStore("photos").index("vehicleId").getAllKeys(id);
  await Promise.all([...keys.map((k) => tx.objectStore("photos").delete(k)), tx.objectStore("vehicles").delete(id)]);
  await tx.done;
  emitChange();
}

export async function listPhotos(vehicleId: string) {
  const all = await (await db()).getAllFromIndex("photos", "vehicleId", vehicleId);
  return all.sort((a, b) => a.order - b.order);
}
export const getPhoto = async (id: string) => (await db()).get("photos", id);
export async function putPhoto(p: Photo) {
  p.updatedAt = Date.now();
  const d = await db();
  await d.put("photos", p);
  const v = await d.get("vehicles", p.vehicleId);
  if (v) await d.put("vehicles", { ...v, updatedAt: Date.now() });
  emitChange();
}
export async function deletePhoto(id: string) {
  await (await db()).delete("photos", id);
  emitChange();
}

export const listBackgrounds = async () => (await db()).getAll("backgrounds");
export async function putBackground(b: CustomBackground) {
  await (await db()).put("backgrounds", b);
  emitChange();
}
export async function deleteBackground(id: string) {
  await (await db()).delete("backgrounds", id);
  emitChange();
}

export const DEFAULT_SETTINGS: Settings = {
  engine: "auto",
  serverUrl: "",
  serverKey: "",
  outputWidth: 1920,
  aspect: "4:3",
  jpegQuality: 0.88,
  defaultBackground: "studio-white",
  plateText: "",
  plateBg: "#ffffff",
  plateFg: "#111418",
  defaultPlateMode: "none",
  watermarkDefault: true,
  watermarkSize: 0.16,
  logoPos: "top-right",
};

export async function getSettings(): Promise<Settings> {
  const s = (await (await db()).get("kv", "settings")) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function saveSettings(s: Settings) {
  await (await db()).put("kv", s, "settings");
  emitChange();
}

export async function wipeAll() {
  const d = await db();
  await Promise.all([d.clear("vehicles"), d.clear("photos"), d.clear("backgrounds"), d.clear("kv")]);
  emitChange();
}
