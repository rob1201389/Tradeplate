import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import Shell from "@/components/Shell";
import TripOutForm from "@/components/TripOutForm";
import { dateToSydneyWall, expiryStatus } from "@/lib/time";
import { isDriverAuthed } from "@/lib/auth";
import { org } from "@/lib/org";
import DriverPinForm from "@/components/DriverPinForm";

export const dynamic = "force-dynamic";

/** Manual entry for when a plate's QR code is damaged or unreachable. */
export default async function NewTripPage() {
  if (!(await isDriverAuthed())) {
    return (
      <Shell title="Sign a plate out" subtitle="Enter the access PIN to continue.">
        <DriverPinForm next="/new" />
      </Shell>
    );
  }

  const db = getDb();

  const available = await db
    .select({
      plateNumber: schema.plates.plateNumber,
      expiryDate: schema.plates.expiryDate,
    })
    .from(schema.plates)
    .where(eq(schema.plates.active, true))
    .orderBy(asc(schema.plates.plateNumber));

  const open = await db
    .select({ plateNumber: schema.trips.plateNumber })
    .from(schema.trips)
    .where(isNull(schema.trips.inAt));

  const outNow = new Set(open.map((o) => o.plateNumber));
  const options = available
    .filter((p) => expiryStatus(p.expiryDate).state !== "expired")
    .map((p) => p.plateNumber)
    .filter((p) => !outNow.has(p));

  return (
    <Shell
      title="Sign a plate out"
      subtitle="Manual entry - normally you would scan the plate."
    >
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">
          No plate is available - they are all signed out or expired.{" "}
          <Link href="/" className="font-medium text-brand underline">
            View plates
          </Link>
        </p>
      ) : (
        <TripOutForm
          plates={options}
          defaultOutAt={dateToSydneyWall(new Date())}
          orgName={org.name}
          retentionYears={org.retentionYears}
        />
      )}
    </Shell>
  );
}
