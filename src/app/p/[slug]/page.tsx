import { and, desc, eq, isNull, not } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import Shell from "@/components/Shell";
import TripOutForm from "@/components/TripOutForm";
import TripInForm from "@/components/TripInForm";
import {
  dateToSydneyWall,
  formatSydney,
  formatDuration,
  expiryStatus,
} from "@/lib/time";
import { isDriverAuthed } from "@/lib/auth";
import { org } from "@/lib/org";
import DriverPinForm from "@/components/DriverPinForm";

export const dynamic = "force-dynamic";

export default async function PlatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { slug } = await params;
  const { saved } = await searchParams;
  const db = getDb();

  const [plate] = await db
    .select()
    .from(schema.plates)
    .where(eq(schema.plates.qrSlug, slug))
    .limit(1);

  if (!plate) notFound();

  if (!(await isDriverAuthed())) {
    return (
      <Shell
        title={`Plate ${plate.plateNumber}`}
        subtitle="Enter the access PIN to record this plate's use."
      >
        <DriverPinForm next={`/p/${slug}`} />
      </Shell>
    );
  }

  const [open] = await db
    .select()
    .from(schema.trips)
    .where(and(eq(schema.trips.plateId, plate.id), isNull(schema.trips.inAt)))
    .orderBy(desc(schema.trips.outAt))
    .limit(1);

  const recent = await db
    .select({
      id: schema.trips.id,
      driverName: schema.trips.driverName,
      tripDestination: schema.trips.tripDestination,
      outAt: schema.trips.outAt,
      inAt: schema.trips.inAt,
    })
    .from(schema.trips)
    .where(
      and(eq(schema.trips.plateId, plate.id), not(isNull(schema.trips.inAt))),
    )
    .orderBy(desc(schema.trips.outAt))
    .limit(5);

  // Batch numbers repeat across a day's trips, so carry the last one forward.
  const [last] = await db
    .select({ batchNumber: schema.trips.batchNumber })
    .from(schema.trips)
    .where(eq(schema.trips.plateId, plate.id))
    .orderBy(desc(schema.trips.outAt))
    .limit(1);

  const now = new Date();
  const expiry = expiryStatus(plate.expiryDate);

  return (
    <>
      <Shell
        title={`Plate ${plate.plateNumber}`}
        subtitle={
          open
            ? `Currently out with ${open.driverName}`
            : !plate.active
              ? "This plate is retired and cannot be signed out"
              : expiry.state === "expired"
                ? "This plate's registration has expired"
                : "Available - fill in the details below"
        }
      >
        {saved === "out" && (
          <Banner tone="ok">
            Signed out. Scan this plate again when it comes back.
          </Banner>
        )}
        {saved === "in" && (
          <Banner tone="ok">Booked back in. Record closed off.</Banner>
        )}

        {expiry.state === "soon" && (
          <Banner tone="warn">{expiry.label}. Tell the office.</Banner>
        )}

        {open ? (
          <>
            <dl className="mb-5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
              <Detail label="Out" value={formatSydney(open.outAt)} />
              <Detail label="Batch" value={open.batchNumber} />
              <Detail label="Vehicle" value={open.vehicleMake} />
              <Detail label="Rego / VIN" value={open.vehicleRego ?? "-"} />
              <Detail label="Destination" value={open.tripDestination} wide />
              <Detail label="Purpose" value={open.purpose ?? "-"} wide />
              <Detail label="Driver" value={open.driverName} wide />
            </dl>
            <TripInForm
              tripId={open.id}
              defaultInAt={dateToSydneyWall(now)}
              orgName={org.name}
              retentionYears={org.retentionYears}
            />
          </>
        ) : !plate.active ? (
          <p className="text-sm text-slate-600">
            Speak to the office - this plate has been taken out of service.
          </p>
        ) : expiry.state === "expired" ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">{expiry.label}.</p>
            <p className="mt-1">
              This plate cannot be signed out. Take a different plate and tell
              the office.
            </p>
          </div>
        ) : (
          <TripOutForm
            plates={[plate.plateNumber]}
            lockedPlate={plate.plateNumber}
            defaultOutAt={dateToSydneyWall(now)}
            defaultBatch={last?.batchNumber}
            orgName={org.name}
            retentionYears={org.retentionYears}
          />
        )}
      </Shell>

      {recent.length > 0 && (
        <div className="mx-auto w-full max-w-lg px-4 pb-16">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Last {recent.length} trips on this plate
          </h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {recent.map((t) => (
              <li key={t.id} className="px-4 py-3 text-sm">
                <div className="font-medium text-ink">{t.driverName}</div>
                <div className="text-slate-600">{t.tripDestination}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {formatSydney(t.outAt)} to {formatSydney(t.inAt)} (
                  {formatDuration(t.outAt, t.inAt!)})
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs text-slate-500">
            <Link href="/privacy" className="underline">
              Privacy notice
            </Link>
            {" · "}
            <Link href="/admin" className="underline">
              Office login
            </Link>
          </p>
        </div>
      )}
    </>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`mb-4 rounded-lg border px-3 py-2 text-sm font-medium ${cls}`}>
      {children}
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
