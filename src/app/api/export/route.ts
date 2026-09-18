import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isAuthed } from "@/lib/auth";
import { parseFilters, tripWhere } from "@/lib/query";
import { toCsv } from "@/lib/csv";
import { formatDuration, formatSydney } from "@/lib/time";

export const dynamic = "force-dynamic";

const HEADERS = [
  "Record ID",
  "Plate number",
  "Date and time out",
  "Date and time in",
  "Duration",
  "Batch number",
  "Vehicle make",
  "Vehicle rego / VIN",
  "Trip destination",
  "Purpose of use",
  "Driver name",
  "Driver licence",
  "Signed out",
  "Signed in",
  "Notes",
  "Entry created",
  "Entry closed",
];

export async function GET(request: Request) {
  if (!(await isAuthed())) {
    return new Response("Not authorised", { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseFilters(Object.fromEntries(url.searchParams));
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.trips)
    .where(tripWhere(filters))
    .orderBy(desc(schema.trips.outAt));

  const csv = toCsv(
    HEADERS,
    rows.map((t) => [
      t.id,
      t.plateNumber,
      formatSydney(t.outAt),
      t.inAt ? formatSydney(t.inAt) : "STILL OUT",
      t.inAt ? formatDuration(t.outAt, t.inAt) : "",
      t.batchNumber,
      t.vehicleMake,
      t.vehicleRego ?? "",
      t.tripDestination,
      t.purpose ?? "",
      t.driverName,
      t.driverLicence ?? "",
      t.signatureOut ? "Yes" : "No",
      t.signatureIn ? "Yes" : "No",
      t.notes ?? "",
      formatSydney(t.createdAt),
      t.completedAt ? formatSydney(t.completedAt) : "",
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="trade-plate-record-of-use-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
