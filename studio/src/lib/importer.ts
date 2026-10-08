// Stock import from a spreadsheet (CSV or Excel) or a screenshot of a stock
// list. Everything runs on the device. Spreadsheets map by column heading;
// screenshots go through text recognition and are a best guess, so the
// import screen always shows the rows for checking before saving.
import { listVehicles, putVehicle, uid } from "./db";
import type { Vehicle } from "./types";
import { localDecode, normaliseVin, repairVin } from "./vin";

export type Field = "stockNo" | "vin" | "rego" | "year" | "make" | "model" | "variant" | "colour";
export type Row = Partial<Record<Field, string>>;

export const FIELDS: [Field, string][] = [
  ["stockNo", "Stock no."],
  ["vin", "VIN"],
  ["rego", "Rego"],
  ["year", "Year"],
  ["make", "Make"],
  ["model", "Model"],
  ["variant", "Variant"],
  ["colour", "Colour"],
];

const HEADINGS: Record<Field, string[]> = {
  stockNo: ["stock", "stockno", "stocknumber", "stock#", "stocknum", "stk", "stkno", "stockid", "stockref", "ref", "reference", "unit", "unitno"],
  vin: ["vin", "vinno", "vinnumber", "chassis", "chassisno", "chassisnumber", "vinchassis", "frame"],
  rego: ["rego", "regono", "registration", "registrationno", "regonumber", "plate", "plateno", "numberplate", "reg"],
  year: ["year", "yr", "modelyear", "buildyear", "compliance", "compliancedate", "builddate"],
  make: ["make", "manufacturer", "brand", "marque"],
  model: ["model", "modelname"],
  variant: ["variant", "badge", "series", "trim", "grade", "submodel", "derivative"],
  colour: ["colour", "color", "colourdescription", "colordescription", "exteriorcolour", "exteriorcolor", "paint", "paintdescription", "extcolour", "extcolor", "bodycolour"],
};

/** Columns that hold "2021 Toyota Yaris Cross GX" in one cell. */
const COMBINED = ["vehicle", "description", "vehicledescription", "title", "name", "makemodel", "car"];

export const MAKES = [
  "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "BYD", "Chery", "Chevrolet", "Chrysler", "Citroen", "Cupra",
  "Dodge", "Ferrari", "Fiat", "Ford", "Genesis", "GWM", "Haval", "Holden", "Honda", "HSV", "Hyundai", "Infiniti", "Isuzu",
  "Jaguar", "Jeep", "Kia", "KGM", "Lamborghini", "Land Rover", "Range Rover", "LDV", "Lexus", "Lotus", "Maserati", "Mazda",
  "McLaren", "Mercedes-Benz", "Mercedes", "MG", "Mini", "Mitsubishi", "Nissan", "Peugeot", "Polestar", "Porsche", "Ram",
  "Renault", "Rolls-Royce", "Skoda", "Smart", "SsangYong", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "VW",
  "Volvo", "Zeekr", "Deepal", "Leapmotor", "Mahindra", "Tata", "Great Wall", "Proton", "Daihatsu", "Saab", "Alpine",
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, "");
const cell = (v: unknown) => (v == null ? "" : v instanceof Date ? String(v.getFullYear()) : String(v).trim());

// Model names as the makers write them, longest first so "Yaris Cross" beats
// "Yaris". Short forms on the left are what stock lists tend to use.
const MODELS: [RegExp, string][] = (
  [
    ["LandCruiser Prado|Land Cruiser Prado|LC Prado", "LandCruiser Prado"], ["LandCruiser|Land Cruiser|LC", "LandCruiser"], ["Yaris Cross", "Yaris Cross"],
    ["Corolla Cross", "Corolla Cross"], ["GR Yaris", "GR Yaris"], ["GR Corolla", "GR Corolla"], ["GR86", "GR86"], ["Pajero Sport", "Pajero Sport"],
    ["Eclipse Cross", "Eclipse Cross"], ["Santa Fe", "Santa Fe"], ["X-Trail|XTrail", "X-Trail"], ["HiLux|Hilux", "HiLux"], ["HiAce|Hiace", "HiAce"],
    ["RAV4|RAV 4", "RAV4"], ["C-HR|CHR", "C-HR"], ["bZ4X", "bZ4X"], ["Prado", "LandCruiser Prado"], ["Camry", "Camry"], ["Corolla", "Corolla"],
    ["Yaris", "Yaris"], ["Kluger", "Kluger"], ["Fortuner", "Fortuner"], ["Granvia", "Granvia"], ["Coaster", "Coaster"], ["Supra", "Supra"],
    ["Tundra", "Tundra"], ["Mirai", "Mirai"], ["Ranger", "Ranger"], ["Everest", "Everest"], ["Mustang", "Mustang"], ["Puma", "Puma"],
    ["Escape", "Escape"], ["Transit", "Transit"], ["BT-50|BT50", "BT-50"], ["CX-30|CX30", "CX-30"], ["CX-3|CX3", "CX-3"], ["CX-5|CX5", "CX-5"],
    ["CX-60|CX60", "CX-60"], ["CX-8|CX8", "CX-8"], ["CX-90|CX90", "CX-90"], ["MX-5|MX5", "MX-5"], ["Mazda2|Mazda 2", "Mazda2"], ["Mazda3|Mazda 3", "Mazda3"],
    ["Triton", "Triton"], ["Outlander", "Outlander"], ["ASX", "ASX"], ["D-Max|DMax", "D-Max"], ["MU-X|MUX", "MU-X"], ["Navara", "Navara"],
    ["Patrol", "Patrol"], ["Qashqai", "Qashqai"], ["i30", "i30"], ["Tucson", "Tucson"], ["Kona", "Kona"], ["Sportage", "Sportage"],
    ["Sorento", "Sorento"], ["Cerato", "Cerato"], ["Carnival", "Carnival"], ["Forester", "Forester"], ["Outback", "Outback"], ["Model 3", "Model 3"], ["Model Y", "Model Y"],
  ] as [string, string][]
).map(([pat, name]) => [new RegExp(`^(?:${pat})(?=\\s|$)`, "i"), name]);

/** Toyota and others end descriptions with model and suffix codes, e.g. "2U22310 001". */
const stripCodes = (t: string) => t.replace(/\s+[A-Z0-9]{6,8}\s?\d{3}\s*$/i, "").trim();

/** Reads "2021 Toyota Yaris Cross GX" or "Hilux 4x2 Workmate 2.8L…" into year / make / model / variant. */
export function splitDescription(text: string): Row {
  const out: Row = {};
  let rest = ` ${stripCodes(text.replace(/\s+/g, " ").trim())} `;
  const y = rest.match(/ (19[5-9]\d|20[0-4]\d) /);
  if (y) {
    out.year = y[1];
    rest = rest.replace(y[0], " ");
  }
  const lower = rest.toLowerCase();
  let best: { make: string; at: number } | null = null;
  for (const m of MAKES) {
    const at = lower.indexOf(` ${m.toLowerCase()} `);
    if (at >= 0 && (!best || at < best.at || (at === best.at && m.length > best.make.length))) best = { make: m, at };
  }
  let after = rest.trim();
  if (best) {
    out.make = best.make === "VW" ? "Volkswagen" : best.make === "Mercedes" ? "Mercedes-Benz" : best.make;
    after = rest.slice(best.at + best.make.length + 2).trim();
  }
  if (!after) return out;
  const known = MODELS.find(([re]) => re.test(after));
  if (known) {
    out.model = known[1];
    const variant = after.replace(known[0], "").trim();
    if (variant) out.variant = variant;
    return out;
  }
  const words = after.split(" ");
  // Unknown model: first word, plus a second if it looks like part of the name.
  const model = [words[0]];
  if (words[1] && /^[A-Z][a-z]+$/.test(words[1]) && !/^(Auto|Automatic|Manual|Petrol|Diesel|Hybrid|Wagon|Sedan|Hatch|Ute|Workmate)$/i.test(words[1])) model.push(words[1]);
  if (best || words.length > 1) out.model = model.join(" ");
  const variant = words.slice(model.length).join(" ");
  if (variant) out.variant = variant;
  return out;
}

export function rowsFromTable(table: unknown[][]): { rows: Row[]; mapped: Field[] } {
  const grid = table.map((r) => r.map(cell)).filter((r) => r.some(Boolean));
  if (!grid.length) return { rows: [], mapped: [] };
  // The heading row is the first one where a known heading appears.
  let headIdx = grid.findIndex((r) => r.some((c) => Object.values(HEADINGS).some((hs) => hs.includes(norm(c))) || COMBINED.includes(norm(c))));
  if (headIdx < 0) headIdx = 0;
  const heads = grid[headIdx].map(norm);
  const colOf: Partial<Record<Field, number>> = {};
  (Object.keys(HEADINGS) as Field[]).forEach((f) => {
    const i = heads.findIndex((h) => HEADINGS[f].includes(h));
    if (i >= 0) colOf[f] = i;
  });
  const combinedCol = heads.findIndex((h) => COMBINED.includes(h));
  const rows: Row[] = [];
  for (const r of grid.slice(headIdx + 1)) {
    const row: Row = {};
    if (combinedCol >= 0 && r[combinedCol]) Object.assign(row, splitDescription(r[combinedCol]));
    (Object.keys(colOf) as Field[]).forEach((f) => {
      const v = r[colOf[f]!];
      if (v) row[f] = v;
    });
    if (row.vin) {
      row.vin = normaliseVin(row.vin);
      // Make from the VIN when the description leaves it out.
      if (!row.make && row.vin.length === 17) row.make = localDecode(row.vin).make || undefined;
    }
    if (row.year) row.year = row.year.match(/(19|20)\d\d/)?.[0] ?? row.year;
    if (row.rego) row.rego = row.rego.toUpperCase().replace(/\s+/g, "");
    if (Object.values(row).some(Boolean)) rows.push(row);
  }
  return { rows, mapped: Object.keys(colOf) as Field[] };
}

/** RFC 4180 CSV, with a guess at the separator for exports that use ; or tab. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const out: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); out.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out;
}

export async function readSpreadsheet(file: File): Promise<{ rows: Row[]; mapped: Field[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return rowsFromTable((await readSheet(file)) as unknown[][]);
  }
  if (name.endsWith(".xls")) throw new Error("Old .xls files aren't supported. Save it as .xlsx or CSV and try again.");
  return rowsFromTable(parseCsv(await file.text()));
}

interface OcrWord { text: string; x0: number; x1: number; y0: number; y1: number }

/**
 * Screenshot of a stock list. When a heading row is visible (VIN, Colour,
 * Description...), words are put into columns by where they sit under the
 * headings, then mapped like a spreadsheet. Without headings, each text line
 * holding a VIN, or a year and a make, becomes a row.
 */
export async function readScreenshot(file: File, onProgress: (p: number, stage: string) => void): Promise<Row[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => onProgress(m.progress, m.status),
  });
  try {
    // Screen text is small; reading it at 2-3x size cuts J/1 and 0/D mix-ups.
    const img = await enlarge(file);
    const { data } = await worker.recognize(img, {}, { blocks: true, text: true });
    const lines: OcrWord[][] = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) lines.push(l.words.map((w) => ({ text: w.text, ...w.bbox })));
    const table = tableFromWords(lines);
    const rows = table ? rowsFromTable(table).rows : rowsFromText(data.text);
    return rows.map(fixVin).filter((r) => r.vin || r.make || r.model);
  } finally {
    await worker.terminate();
  }
}

async function enlarge(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(3, Math.max(1, 2400 / bmp.width));
  if (k === 1) return file;
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.convertToBlob({ type: "image/png" });
}

function fixVin(row: Row): Row {
  if (!row.vin) return row;
  const r = repairVin(row.vin);
  const out = { ...row, vin: r.vin };
  if (!out.make && r.vin.length === 17) out.make = localDecode(r.vin).make || undefined;
  return out;
}

const HEAD_WORDS = new Set(["vin", "stock", "stockno", "rego", "registration", "year", "make", "model", "variant", "colour", "color", "description", "vehicle", "chassis", "series", "badge", "trim", "sold", "to", "no", "number"]);

function tableFromWords(lines: OcrWord[][]): string[][] | null {
  const sorted = lines.filter((l) => l.length).sort((a, b) => a[0].y0 - b[0].y0);
  const headIdx = sorted.findIndex((l) => l.filter((w) => HEAD_WORDS.has(norm(w.text))).length >= 2);
  if (headIdx < 0) return null;
  const head = [...sorted[headIdx]].sort((a, b) => a.x0 - b.x0);
  // Split the heading into columns wherever the gap is wider than a couple of letters.
  const charW = head.reduce((s, w) => s + (w.x1 - w.x0) / Math.max(1, w.text.length), 0) / head.length;
  const cols: { title: string; x0: number }[] = [];
  head.forEach((w, i) => {
    if (i && w.x0 - head[i - 1].x1 < charW * 2.2) cols[cols.length - 1].title += " " + w.text;
    else cols.push({ title: w.text, x0: w.x0 });
  });
  if (cols.length < 2) return null;
  const colFor = (w: OcrWord) => {
    let c = 0;
    for (let i = 0; i < cols.length; i++) if (w.x0 >= cols[i].x0 - charW * 1.5) c = i;
    return c;
  };
  // Lines that tesseract split at a wide gap come back separately; merge by vertical overlap.
  const rows: OcrWord[][] = [];
  for (const l of sorted.slice(headIdx + 1)) {
    const mid = (l[0].y0 + l[0].y1) / 2;
    const same = rows.find((r) => mid > r[0].y0 && mid < r[0].y1);
    if (same) same.push(...l);
    else rows.push([...l]);
  }
  return [
    cols.map((c) => c.title),
    ...rows.map((r) => {
      const cells = cols.map(() => [] as string[]);
      [...r].sort((a, b) => a.x0 - b.x0).forEach((w) => cells[colFor(w)].push(w.text));
      return cells.map((c) => c.join(" "));
    }),
  ];
}

export function rowsFromText(text: string): Row[] {
  const rows: Row[] = [];
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
    if (line.length < 6) continue;
    const row: Row = {};
    const vinMatch = line.toUpperCase().match(/\b[A-Z0-9]{17}\b/);
    let rest = line;
    if (vinMatch && /\d/.test(vinMatch[0]) && /[A-Z]/.test(vinMatch[0])) {
      row.vin = normaliseVin(vinMatch[0]);
      rest = rest.replace(new RegExp(vinMatch[0], "i"), " ");
    }
    Object.assign(row, splitDescription(rest));
    if (!row.vin && !(row.year && row.make)) continue;
    rows.push(row);
  }
  return rows;
}

export interface ImportPlan {
  row: Row;
  existing?: Vehicle;
}

export async function planImport(rows: Row[]): Promise<ImportPlan[]> {
  const vs = await listVehicles();
  const byVin = new Map(vs.filter((v) => v.vin).map((v) => [v.vin, v]));
  const byStock = new Map(vs.filter((v) => v.stockNo).map((v) => [v.stockNo.toUpperCase(), v]));
  for (const row of rows) {
    // Fill blanks the VIN can answer offline.
    if (row.vin && row.vin.length === 17) {
      const d = localDecode(row.vin);
      if (!row.make && d.make) row.make = d.make;
      if (!row.year && d.year) row.year = d.year;
    }
  }
  return rows.map((row) => ({ row, existing: (row.vin && byVin.get(row.vin)) || (row.stockNo && byStock.get(row.stockNo.toUpperCase())) || undefined }));
}

/** Adds new vehicles; for existing ones, fills in or replaces with the imported values. */
export async function applyImport(plans: ImportPlan[]): Promise<{ added: number; updated: number }> {
  let added = 0, updated = 0;
  for (const { row, existing } of plans) {
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v && String(v).trim())) as Row;
    if (existing) {
      await putVehicle({ ...existing, ...clean });
      updated++;
    } else {
      await putVehicle({ id: uid(), stockNo: "", vin: "", year: "", make: "", model: "", variant: "", colour: "", createdAt: Date.now(), updatedAt: Date.now(), ...clean });
      added++;
    }
  }
  return { added, updated };
}
