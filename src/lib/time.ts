/**
 * All record keeping is done in NSW local time - that is what an auditor reads
 * on the page - while the database stores proper UTC instants.
 */
export const TZ = "Australia/Sydney";

function zonedParts(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Milliseconds Sydney is ahead of UTC at the given instant (+10h or +11h). */
function offsetMs(instant: Date) {
  const p = zonedParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * Turns a `datetime-local` value ("2026-09-18T07:45") read as Sydney wall time
 * into a UTC instant, independent of the phone's own timezone setting.
 */
export function sydneyWallToDate(wall: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes so the hour either side of a DST change resolves correctly.
  let result = naive - offsetMs(new Date(naive));
  result = naive - offsetMs(new Date(result));
  const date = new Date(result);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Inverse of the above - for prefilling `datetime-local` inputs. */
export function dateToSydneyWall(instant: Date): string {
  const p = zonedParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatSydney(instant: Date | null | undefined): string {
  if (!instant) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(instant)
    .replace(",", "");
}

export function formatDuration(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Today's date in NSW, as YYYY-MM-DD. */
export function sydneyToday(): string {
  return dateToSydneyWall(new Date()).slice(0, 10);
}

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/**
 * Trade plate registrations expire. Driving on an expired plate is the thing
 * that gets a dealer in trouble, so the app treats it as a hard stop rather
 * than a warning.
 */
export function expiryStatus(expiry: string | null | undefined): {
  state: ExpiryState;
  days: number | null;
  label: string;
} {
  if (!expiry) return { state: "none", days: null, label: "Not set" };

  const today = sydneyToday();
  const msPerDay = 86_400_000;
  const days = Math.round(
    (Date.parse(expiry + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
      msPerDay,
  );

  const pretty = expiry.split("-").reverse().join("/");
  if (days < 0) return { state: "expired", days, label: `Expired ${pretty}` };
  if (days === 0) return { state: "soon", days, label: `Expires today` };
  if (days <= 30)
    return {
      state: "soon",
      days,
      label: `Expires ${pretty} (${days} day${days === 1 ? "" : "s"})`,
    };
  return { state: "ok", days, label: pretty };
}
