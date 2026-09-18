import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { formatDuration, formatSydney } from "@/lib/time";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isInteger(tripId)) notFound();

  const db = getDb();
  const [trip] = await db
    .select()
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId))
    .limit(1);

  if (!trip) notFound();

  return (
    <div className="max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/admin" className="text-sm font-medium text-brand underline">
          Back to records
        </Link>
        {/* A printed single record is what gets handed to an auditor. */}
        <PrintButton label="Print this record" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold text-ink">
          Plate {trip.plateNumber} - record #{trip.id}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {formatSydney(trip.outAt)} to{" "}
          {trip.inAt ? formatSydney(trip.inAt) : "still out"}
          {trip.inAt ? ` (${formatDuration(trip.outAt, trip.inAt)})` : ""}
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="Date and time out" value={formatSydney(trip.outAt)} />
          <Row
            label="Date and time in"
            value={trip.inAt ? formatSydney(trip.inAt) : "Not returned"}
          />
          <Row label="Batch number" value={trip.batchNumber} />
          <Row label="Vehicle make" value={trip.vehicleMake} />
          <Row label="Vehicle rego / VIN" value={trip.vehicleRego} />
          <Row label="Trip destination" value={trip.tripDestination} />
          <Row label="Purpose of use" value={trip.purpose} />
          <Row label="Driver's name" value={trip.driverName} />
          <Row label="Driver's licence" value={trip.driverLicence} />
          <Row label="Notes" value={trip.notes} />
        </dl>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SignatureBlock
            title="Signed out by driver"
            when={formatSydney(trip.createdAt)}
            data={trip.signatureOut}
          />
          <SignatureBlock
            title="Signed in by driver"
            when={trip.completedAt ? formatSydney(trip.completedAt) : null}
            data={trip.signatureIn}
          />
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>
            Created {formatSydney(trip.createdAt)}
            {trip.createdIp ? ` from ${trip.createdIp}` : ""}
          </p>
          {trip.completedAt && (
            <p>
              Closed off {formatSydney(trip.completedAt)}
              {trip.completedIp ? ` from ${trip.completedIp}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-medium text-ink">{value || "-"}</dd>
    </div>
  );
}

function SignatureBlock({
  title,
  when,
  data,
}: {
  title: string;
  when: string | null;
  data: string | null;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      {data ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data}
            alt={title}
            className="mt-1 h-28 w-full rounded-lg border border-slate-300 bg-white object-contain"
          />
          {when && <p className="mt-1 text-xs text-slate-500">{when}</p>}
        </>
      ) : (
        <p className="mt-1 flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
          Not signed
        </p>
      )}
    </div>
  );
}
