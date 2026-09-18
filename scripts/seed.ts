/**
 * Adds plates from the command line, generating a QR slug for each.
 *   npm run db:seed -- "1234 TP" "5678 TP"
 */
import { config } from "dotenv";
import { asc } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { newQrSlug } from "../src/lib/auth";
import { plateUrl } from "../src/lib/qr";

config({ path: ".env" });

async function main() {
  const numbers = process.argv.slice(2).map((s) => s.trim().toUpperCase());
  const db = getDb();

  if (numbers.length === 0) {
    const all = await db
      .select()
      .from(schema.plates)
      .orderBy(asc(schema.plates.plateNumber));
    if (all.length === 0) {
      console.log('No plates on file. Add some: npm run db:seed -- "1234 TP"');
    }
    for (const p of all) {
      console.log(`${p.plateNumber}\t${plateUrl(p.qrSlug)}`);
    }
    process.exit(0);
  }

  for (const plateNumber of numbers) {
    await db
      .insert(schema.plates)
      .values({ plateNumber, qrSlug: newQrSlug() })
      .onConflictDoNothing();
    console.log(`added ${plateNumber}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
