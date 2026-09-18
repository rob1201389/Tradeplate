/**
 * Loads plates and prints their scan URLs.
 *
 *   npm run db:seed -- --file scripts/plates.csv   # bulk load (plate_number,expiry_date,notes)
 *   npm run db:seed -- A3178 A3180                 # add a few by hand
 *   npm run db:seed -- A3178=2027-06-30            # with an expiry date
 *   npm run db:seed                                # list what is on file
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { asc } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { newQrSlug } from "../src/lib/auth";
import { plateUrl } from "../src/lib/qr";

config({ path: ".env" });

type Row = { plateNumber: string; expiryDate: string | null; notes: string | null };

function fromCsv(path: string): Row[] {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Skip the header if it looks like one.
  if (lines[0] && /plate/i.test(lines[0])) lines.shift();

  return lines.map((line) => {
    const [number, expiry, notes] = line.split(",").map((c) => (c ?? "").trim());
    return {
      plateNumber: number.toUpperCase(),
      expiryDate: expiry || null,
      notes: notes || null,
    };
  });
}

function fromArgs(args: string[]): Row[] {
  return args.map((arg) => {
    const [number, expiry] = arg.split("=");
    return {
      plateNumber: number.trim().toUpperCase(),
      expiryDate: (expiry || "").trim() || null,
      notes: null,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const rows =
    fileIndex !== -1
      ? fromCsv(args[fileIndex + 1])
      : fromArgs(args.filter((a) => !a.startsWith("--")));

  const db = getDb();

  for (const row of rows) {
    if (!row.plateNumber) continue;
    if (row.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate)) {
      console.error(`skipped ${row.plateNumber}: expiry must be YYYY-MM-DD`);
      continue;
    }
    const inserted = await db
      .insert(schema.plates)
      .values({ ...row, qrSlug: newQrSlug() })
      .onConflictDoNothing()
      .returning({ id: schema.plates.id });
    console.log(
      `${inserted.length ? "added  " : "skipped"} ${row.plateNumber}${
        inserted.length ? "" : " (already on file)"
      }`,
    );
  }

  const all = await db
    .select()
    .from(schema.plates)
    .orderBy(asc(schema.plates.plateNumber));

  if (!all.length) {
    console.log("\nNo plates on file. Load them: npm run db:seed -- --file scripts/plates.csv");
  } else {
    console.log("\nPlate\tExpiry\t\tScan URL");
    for (const p of all) {
      console.log(`${p.plateNumber}\t${p.expiryDate ?? "-         "}\t${plateUrl(p.qrSlug)}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
