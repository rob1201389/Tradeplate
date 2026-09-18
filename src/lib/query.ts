import { and, eq, gte, ilike, isNull, isNotNull, lt, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import { sydneyWallToDate } from "./time";

export type TripFilters = {
  from: string;
  to: string;
  plate: string;
  driver: string;
  status: "" | "open" | "closed";
};

export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): TripFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const status = one("status");
  return {
    from: /^\d{4}-\d{2}-\d{2}$/.test(one("from")) ? one("from") : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(one("to")) ? one("to") : "",
    plate: one("plate"),
    driver: one("driver"),
    status: status === "open" || status === "closed" ? status : "",
  };
}

/** Filters on `out_at`, since that is the date an auditor asks about. */
export function tripWhere(f: TripFilters): SQL | undefined {
  const parts: (SQL | undefined)[] = [];

  if (f.from) {
    const start = sydneyWallToDate(`${f.from}T00:00`);
    if (start) parts.push(gte(schema.trips.outAt, start));
  }
  if (f.to) {
    // Exclusive upper bound at midnight the following day, NSW time.
    const endExclusive = sydneyWallToDate(`${f.to}T00:00`);
    if (endExclusive)
      parts.push(
        lt(schema.trips.outAt, new Date(endExclusive.getTime() + 86_400_000)),
      );
  }
  if (f.plate) parts.push(eq(schema.trips.plateNumber, f.plate));
  if (f.driver) parts.push(ilike(schema.trips.driverName, `%${f.driver}%`));
  if (f.status === "open") parts.push(isNull(schema.trips.inAt));
  if (f.status === "closed") parts.push(isNotNull(schema.trips.inAt));

  const defined = parts.filter(Boolean) as SQL[];
  return defined.length ? and(...defined) : undefined;
}

export function filtersToSearch(f: TripFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}
