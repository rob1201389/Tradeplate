// VIN helpers. Check digit is only mandatory for North American VINs, so a
// failure is a warning, not a block.

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export const normaliseVin = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[IOQ]/g, (c) => (c === "I" ? "1" : "0"));

export function vinCheck(vin: string): "ok" | "bad-length" | "check-digit" {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "bad-length";
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    sum += (/\d/.test(ch) ? Number(ch) : TRANSLIT[ch]) * WEIGHTS[i];
  }
  const r = sum % 11;
  return vin[8] === (r === 10 ? "X" : String(r)) ? "ok" : "check-digit";
}

export interface VinInfo { year: string; make: string; model: string; variant: string }

/**
 * Free US government decoder. Good on make and year worldwide, patchier on
 * model for Australian-delivered and grey-import vehicles.
 */
export async function decodeVin(vin: string): Promise<VinInfo> {
  const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
  if (!r.ok) throw new Error(`Decoder returned ${r.status}`);
  const row = (await r.json()).Results?.[0] ?? {};
  const cap = (s: string) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "");
  return {
    year: row.ModelYear || "",
    make: cap(row.Make || ""),
    model: row.Model || "",
    variant: [row.Trim, row.Series].filter(Boolean).join(" "),
  };
}

type Detector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> };

export const barcodeSupported = () => "BarcodeDetector" in globalThis;

/** Reads a VIN barcode (door jamb / windscreen sticker) from a photo. */
export async function scanVin(photo: Blob): Promise<string | null> {
  if (!barcodeSupported()) return null;
  const BD = (globalThis as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  const det = new BD({ formats: ["code_39", "code_128", "data_matrix", "qr_code", "pdf417"] });
  const bmp = await createImageBitmap(photo);
  const codes = await det.detect(bmp);
  bmp.close();
  for (const c of codes) {
    const v = normaliseVin(c.rawValue);
    // Some stickers prefix an "I" or add check characters; find the 17-char run.
    const m = v.match(/[A-HJ-NPR-Z0-9]{17}/);
    if (m) return m[0];
  }
  return null;
}
