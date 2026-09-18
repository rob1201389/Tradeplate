/**
 * Deletes records past the retention period set in RETENTION_YEARS, measured
 * from the time the plate went out. Run it on a schedule (monthly is plenty):
 *   npx tsx scripts/purge.ts          # report only
 *   npx tsx scripts/purge.ts --apply  # actually delete
 */
import { config } from "dotenv";
import { and, count, lt, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { org } from "../src/lib/org";
import { formatSydney } from "../src/lib/time";

config({ path: ".env" });

async function main() {
  const apply = process.argv.includes("--apply");
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - org.retentionYears);

  // Only ever touch closed records - an open one is still in use.
  const where = and(lt(schema.trips.outAt, cutoff), isNotNull(schema.trips.inAt));
  const db = getDb();

  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.trips)
    .where(where);

  console.log(`Retention: ${org.retentionYears} years`);
  console.log(`Cutoff:    trips that went out before ${formatSydney(cutoff)}`);
  console.log(`Matching:  ${value} closed record(s)`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to delete them.");
    process.exit(0);
  }

  await db.delete(schema.trips).where(where);
  console.log(`Deleted ${value} record(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
