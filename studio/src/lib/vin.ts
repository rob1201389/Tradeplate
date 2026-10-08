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

export interface VinInfo {
  year: string;
  make: string;
  model: string;
  variant: string;
  /** Where it was built, from the first character(s). */
  country: string;
  /** Model came from the US database, which only knows US-market vehicles. */
  modelFound: boolean;
}

// Manufacturer codes (first three characters, or first two as a fallback) for
// what is commonly sold in Australia. Make only; models need paid data here.
const WMI: Record<string, string> = {
  JT: "Toyota", JTH: "Lexus", JTJ: "Lexus", "2T2": "Lexus", MR0: "Toyota", MR1: "Toyota", MR2: "Toyota", "6T1": "Toyota", AHT: "Toyota",
  SB1: "Toyota", VNK: "Toyota", NMT: "Toyota", "4T1": "Toyota", "4T3": "Toyota", "5TD": "Toyota", "5TF": "Toyota", "2T1": "Toyota", "2T3": "Toyota",
  JM: "Mazda", MM0: "Mazda", MM8: "Mazda", JN: "Nissan", MNT: "Nissan", VSK: "Nissan", "1N4": "Nissan", "3N1": "Nissan",
  JA: "Mitsubishi", JMB: "Mitsubishi", JMY: "Mitsubishi", MMA: "Mitsubishi", MMB: "Mitsubishi", MMC: "Mitsubishi", MMT: "Mitsubishi",
  JH: "Honda", MRH: "Honda", MHR: "Honda", "1HG": "Honda", "2HG": "Honda", "5J6": "Honda", JF: "Subaru", "4S3": "Subaru", "4S4": "Subaru",
  JS: "Suzuki", MA3: "Suzuki", TSM: "Suzuki", JAA: "Isuzu", JAL: "Isuzu", MPA: "Isuzu", MNA: "Ford", MNB: "Ford", "6FP": "Ford",
  WF0: "Ford", NM0: "Ford", "1FA": "Ford", "1FM": "Ford", "1FT": "Ford", "6G1": "Holden", "6H8": "Holden", KL: "Holden",
  KMH: "Hyundai", KM8: "Hyundai", MAL: "Hyundai", TMA: "Hyundai", NLH: "Hyundai", KMT: "Genesis", KNA: "Kia", KNC: "Kia", KND: "Kia", KNE: "Kia", U5Y: "Kia",
  KPT: "SsangYong", WVW: "Volkswagen", WVG: "Volkswagen", WV1: "Volkswagen", WV2: "Volkswagen", WV3: "Volkswagen", AAV: "Volkswagen", "3VW": "Volkswagen",
  WAU: "Audi", WA1: "Audi", TRU: "Audi", WBA: "BMW", WBS: "BMW", WBY: "BMW", "5UX": "BMW", WMW: "Mini",
  WDD: "Mercedes-Benz", WDB: "Mercedes-Benz", WDC: "Mercedes-Benz", WDF: "Mercedes-Benz", W1K: "Mercedes-Benz", W1N: "Mercedes-Benz", W1V: "Mercedes-Benz", "55S": "Mercedes-Benz",
  WP0: "Porsche", WP1: "Porsche", YV1: "Volvo", YV4: "Volvo", LVY: "Volvo", SAL: "Land Rover", SAJ: "Jaguar", SAD: "Jaguar",
  VF1: "Renault", VF3: "Peugeot", VR3: "Peugeot", VF7: "Citroen", VR7: "Citroen", TMB: "Skoda", ZFA: "Fiat", ZAR: "Alfa Romeo",
  ZAC: "Jeep", "1C4": "Jeep", "1J4": "Jeep", "1J8": "Jeep", ZFF: "Ferrari", ZHW: "Lamborghini", ZAM: "Maserati",
  "5YJ": "Tesla", "7SA": "Tesla", LRW: "Tesla", LGX: "BYD", LC0: "BYD", LGW: "GWM", LVV: "Chery", LPS: "Polestar", YSM: "Polestar", LSJ: "MG",
};

const REGIONS: [RegExp, string][] = [
  [/^[1-5]/, "North America"], [/^6/, "Australia"], [/^7/, "New Zealand"], [/^J/, "Japan"], [/^K/, "Korea"], [/^L/, "China"],
  [/^MA|^MB|^MC|^MD|^ME/, "India"], [/^MF|^MG|^MH|^MJ|^MK/, "Indonesia"], [/^ML|^MM|^MN|^MP|^MR/, "Thailand"], [/^S/, "United Kingdom"],
  [/^TM|^TN|^TP|^TR|^TS|^TT|^TU|^TV/, "Central Europe"], [/^VF|^VR/, "France"], [/^VS|^VT|^VU/, "Spain"], [/^W/, "Germany"],
  [/^YS|^YT|^YU|^YV|^YW/, "Sweden"], [/^Z/, "Italy"], [/^9/, "Brazil"], [/^A/, "South Africa"], [/^NM|^NL/, "Turkey"],
];

const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/**
 * Year from the 10th character. Only trusted where manufacturers for that
 * market reliably encode it: Japanese, Thai and Australian-built VINs often
 * don't, and a wrong year is worse than a blank one.
 */
function vinYear(vin: string): string {
  if (/^[JM67]/.test(vin)) return "";
  const i = YEAR_CODES.indexOf(vin[9]);
  if (i < 0) return "";
  const max = new Date().getFullYear() + 1;
  let y = 1980 + i;
  while (y + 30 <= max) y += 30;
  return String(y);
}

export function localDecode(vin: string): { make: string; country: string; year: string } {
  return {
    make: WMI[vin.slice(0, 3)] ?? WMI[vin.slice(0, 2)] ?? "",
    country: REGIONS.find(([re]) => re.test(vin))?.[1] ?? "",
    year: vin.length === 17 ? vinYear(vin) : "",
  };
}

/**
 * Local lookup first (works offline, covers make and country for anything),
 * then the free US NHTSA database for model where it knows the car. That
 * database is patchy for Australian-delivered and Thai/Australian-built
 * vehicles, so model is often blank for those.
 */
export async function decodeVin(vin: string): Promise<VinInfo> {
  const local = localDecode(vin);
  const cap = (s: string) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "");
  let row: Record<string, string> = {};
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) row = (await r.json()).Results?.[0] ?? {};
  } catch {
    /* offline or blocked: local result stands */
  }
  const nhtsaMake = cap(row.Make || "");
  return {
    make: local.make || (nhtsaMake === "Mercedes-benz" ? "Mercedes-Benz" : nhtsaMake),
    // NHTSA's year is only meaningful for North American VINs.
    year: local.year || (/^[1-5]/.test(vin) ? row.ModelYear || "" : ""),
    model: row.Model || "",
    // US trim names (LE, XLE...) don't match Australian variants.
    variant: /^[1-5]/.test(vin) ? row.Trim || "" : "",
    country: local.country,
    modelFound: !!row.Model,
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

// Characters text recognition commonly confuses. VINs never contain I, O or Q.
const LOOKALIKE: Record<string, string> = {
  "1": "JLT7", J: "1L", L: "1J", T: "17", "7": "1T", "0": "D8", D: "0", "8": "B30", B: "8", "3": "8", "5": "S", S: "5",
  "2": "Z", Z: "2", "6": "G", G: "6", U: "V", V: "U", "4": "A", A: "4",
};

/**
 * Repairs a misread VIN using its check digit. Tries one, then two character
 * swaps from LOOKALIKE and only accepts an answer when exactly one candidate
 * validates, so it never guesses between equally good options.
 */
export function repairVin(raw: string): { vin: string; repaired: boolean; valid: boolean } {
  const vin = normaliseVin(raw);
  if (vin.length !== 17) return { vin, repaired: false, valid: false };
  if (vinCheck(vin) === "ok") return { vin, repaired: false, valid: true };
  const swaps = (v: string) => {
    const out: string[] = [];
    for (let i = 0; i < 17; i++) for (const c of LOOKALIKE[v[i]] ?? "") out.push(v.slice(0, i) + c + v.slice(i + 1));
    return out;
  };
  const one = new Set(swaps(vin).filter((v) => vinCheck(v) === "ok"));
  if (one.size === 1) return { vin: [...one][0], repaired: true, valid: true };
  if (one.size > 1) return { vin, repaired: false, valid: false };
  const two = new Set<string>();
  for (const a of swaps(vin)) for (const b of swaps(a)) if (b !== vin && vinCheck(b) === "ok") two.add(b);
  if (two.size === 1) return { vin: [...two][0], repaired: true, valid: true };
  return { vin, repaired: false, valid: false };
}
