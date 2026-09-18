import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatSydney } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDb();

  const plates = await db
    .select()
    .from(schema.plates)
    .where(eq(schema.plates.active, true))
    .orderBy(asc(schema.plates.plateNumber));

  const openTrips = await db
    .select({
      plateId: schema.trips.plateId,
      driverName: schema.trips.driverName,
      outAt: schema.trips.outAt,
      tripDestination: schema.trips.tripDestination,
    })
    .from(schema.trips)
    .where(isNull(schema.trips.inAt));

  const openBy = new Map(openTrips.map((t) => [t.plateId, t]));

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          Trade plate record of use
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Plates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Scan the QR code on the back of a plate, or pick it from the list.
        </p>
      </header>

      {plates.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No plates on file yet.{" "}
          <Link href="/admin/plates" className="font-medium text-brand underline">
            Add your plates
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {plates.map((p) => {
            const out = openBy.get(p.id);
            return (
              <li key={p.id}>
                <Link
                  href={`/p/${p.qrSlug}`}
                  className="flex items-center justify-between gap-3 px-4 py-4 active:bg-slate-50"
                >
                  <div>
                    <div className="text-lg font-bold tracking-wide text-ink">
                      {p.plateNumber}
                    </div>
                    {out ? (
                      <div className="text-xs text-slate-600">
                        {out.driverName} to {out.tripDestination} since{" "}
                        {formatSydney(out.outAt)}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">In the office</div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      out
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {out ? "Out" : "Available"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

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
  );
}
