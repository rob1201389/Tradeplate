import { zipSync } from "fflate";
import { shotLabel } from "./shots";
import type { Photo, Vehicle } from "./types";

export function baseName(v: Vehicle) {
  const id = v.stockNo || v.vin || [v.make, v.model].filter(Boolean).join("-") || "vehicle";
  return id.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "vehicle";
}

export function fileNames(v: Vehicle, photos: Photo[]) {
  const b = baseName(v);
  return photos.map((p, i) => {
    const slot = shotLabel(p.slot).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `${b}_${String(i + 1).padStart(2, "0")}_${slot}.jpg`;
  });
}

export async function exportFiles(v: Vehicle, photos: Photo[]): Promise<File[]> {
  const ready = photos.filter((p) => p.output);
  const names = fileNames(v, ready);
  return ready.map((p, i) => new File([p.output!], names[i], { type: "image/jpeg" }));
}

export async function zipFor(v: Vehicle, photos: Photo[]): Promise<Blob> {
  const files = await exportFiles(v, photos);
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const f of files) entries[f.name] = [new Uint8Array(await f.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(entries) as BlobPart], { type: "application/zip" });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export async function shareFiles(files: File[], title: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files })) return false;
  try {
    await nav.share({ files, title });
  } catch (e) {
    if ((e as Error).name !== "AbortError") throw e;
  }
  return true;
}
