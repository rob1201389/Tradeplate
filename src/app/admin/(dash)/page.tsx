import Link from "next/link";
import { asc, desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { formatDuration, formatSydney } from "@/lib/time";
import { filtersToSearch, parseFilters, tripWhere } from "@/lib/query";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const db = getDb();
  const where = tripWhere(filters);

  const [plates, rows, counted] = await Promise.all([
    db
      .select({ plateNumber: schema.plates.plateNumber })
      .from(schema.plates)
      .orderBy(asc(schema.plates.plateNumber)),
    db
      .select()
      .from(schema.trips)
      .where(where)
      .orderBy(desc(schema.trips.outAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.trips)
      .where(where),
  ]);

  const total = counted[0]?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const search = filtersToSearch(filters);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Record of use</h1>
          <p className="text-sm text-slate-600">
            {total} record{total === 1 ? "" : "s"} matching
          </p>
        </div>
        <a
          href={`/api/export?${search}`}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Export CSV
        </a>
      </div>

      <form
        className="no-print mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6"
        method="get"
      >
        <label className="text-xs font-semibold text-slate-600">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Plate
          <select
            name="plate"
            defaultValue={filters.plate}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
          >
            <option value="">All</option>
            {plates.map((p) => (
              <option key={p.plateNumber} value={p.plateNumber}>
                {p.plateNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Driver
          <input
            type="text"
            name="driver"
            defaultValue={filters.driver}
            placeholder="Any"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Status
          <select
            name="status"
            defaultValue={filters.status}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2"
          >
            <option value="">All</option>
            <option value="open">Still out</option>
            <option value="closed">Returned</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
          <Link
            href="/admin"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th>Plate</Th>
              <Th>Out</Th>
              <Th>In</Th>
              <Th>Duration</Th>
              <Th>Batch</Th>
              <Th>Vehicle</Th>
              <Th>Destination</Th>
              <Th>Driver</Th>
              <Th>Signed</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  No records match those filters.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="align-top">
                <Td className="font-bold">{t.plateNumber}</Td>
                <Td>{formatSydney(t.outAt)}</Td>
                <Td>
                  {t.inAt ? (
                    formatSydney(t.inAt)
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                      Still out
                    </span>
                  )}
                </Td>
                <Td>{t.inAt ? formatDuration(t.outAt, t.inAt) : "-"}</Td>
                <Td>{t.batchNumber}</Td>
                <Td>
                  {t.vehicleMake}
                  {t.vehicleRego ? ` (${t.vehicleRego})` : ""}
                </Td>
                <Td>{t.tripDestination}</Td>
                <Td>{t.driverName}</Td>
                <Td>
                  {t.signatureOut ? "Out" : "-"}
                  {t.signatureIn ? " / In" : ""}
                </Td>
                <Td>
                  <Link
                    href={`/admin/trips/${t.id}`}
                    className="font-medium text-brand underline"
                  >
                    View
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="no-print mt-4 flex items-center justify-between text-sm">
          <PageLink page={page - 1} pages={pages} search={search} label="Previous" />
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <PageLink page={page + 1} pages={pages} search={search} label="Next" />
        </div>
      )}
    </div>
  );
}

function PageLink({
  page,
  pages,
  search,
  label,
}: {
  page: number;
  pages: number;
  search: string;
  label: string;
}) {
  if (page < 1 || page > pages) return <span className="text-slate-300">{label}</span>;
  const qs = new URLSearchParams(search);
  qs.set("page", String(page));
  return (
    <Link href={`/admin?${qs.toString()}`} className="font-medium text-brand underline">
      {label}
    </Link>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-semibold">{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
