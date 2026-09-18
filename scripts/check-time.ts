/**
 * NSW local time is what goes on the record, so the wall-time <-> UTC
 * conversion has to survive both daylight saving switchovers.
 *   npx tsx scripts/check-time.ts
 */
import {
  sydneyWallToDate,
  dateToSydneyWall,
  formatSydney,
  formatDuration,
} from "../src/lib/time";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
};

// DST 2026: starts 2am Sun 4 Oct (AEST +10 -> AEDT +11),
//           ends   3am Sun 5 Apr (AEDT +11 -> AEST +10).
const conversions: [string, string][] = [
  ["2026-01-15T14:30", "2026-01-15T03:30:00.000Z"], // AEDT +11
  ["2026-07-15T14:30", "2026-07-15T04:30:00.000Z"], // AEST +10
  ["2026-10-04T01:30", "2026-10-03T15:30:00.000Z"], // last hour of AEST
  ["2026-10-04T03:30", "2026-10-03T16:30:00.000Z"], // first hour of AEDT
  ["2026-04-05T01:00", "2026-04-04T14:00:00.000Z"], // last hour of AEDT
  ["2026-04-05T04:00", "2026-04-04T18:00:00.000Z"], // after AEST resumes
];

for (const [wall, expected] of conversions) {
  const got = sydneyWallToDate(wall)!.toISOString();
  check(`${wall} -> UTC`, got === expected, got === expected ? "" : `got ${got}, want ${expected}`);
}

// Every valid wall time must survive a round trip.
for (const [wall] of conversions) {
  const round = dateToSydneyWall(sydneyWallToDate(wall)!);
  check(`round trip ${wall}`, round === wall, round);
}

// 2:30am on 4 Oct does not exist; 2:30am on 5 Apr happens twice. Neither may
// blow up, and both must land on a real instant.
for (const odd of ["2026-10-04T02:30", "2026-04-05T02:30"]) {
  const got = sydneyWallToDate(odd);
  check(`handles ${odd}`, got instanceof Date && !Number.isNaN(got.getTime()), got?.toISOString());
}

check("rejects junk", sydneyWallToDate("not a date") === null);
check(
  "formats for humans",
  formatSydney(new Date("2026-09-18T00:16:00Z")) === "18/09/2026 10:16 am",
  formatSydney(new Date("2026-09-18T00:16:00Z")),
);
check(
  "formats duration",
  formatDuration(new Date("2026-09-18T00:00:00Z"), new Date("2026-09-18T03:45:00Z")) === "3h 45m",
);
check("formats sub-hour duration", formatDuration(new Date(0), new Date(25 * 60_000)) === "25m");

process.exit(failed ? 1 : 0);
