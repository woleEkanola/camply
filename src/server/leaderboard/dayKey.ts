/**
 * The leaderboard's one day-boundary helper, with an explicit IANA timezone
 * (from LeaderboardSettings.timezone, defaulting to "Africa/Lagos").
 * Deliberately not shared with scan.ts's dayRange()/utcDayRange() — that
 * file has two incompatible helpers (server-local vs UTC-truncated-for-@db.Date)
 * and comments about having been burned mixing them. A leaderboard scoring
 * midnight boundary must follow the *camp's* clock, not the server's or a
 * fixed UTC day, or a scan at 11:58pm camp-time can land on the wrong day's
 * promptness stats.
 */

/** Returns the calendar date (YYYY-MM-DD) `at` falls on on the camp's clock,
 * suitable for writing into a `@db.Date` column via `new Date(key)`. */
export function campDayKey(at: Date, timezone: string): string {
  // en-CA gives YYYY-MM-DD directly, avoiding manual month/day padding.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Start/end instants (UTC Date objects) of the camp-local calendar day
 * containing `at`. Used for querying DateTime-typed columns (occurredAt,
 * scan timestamps) against a camp-local day boundary. */
export function campDayRange(at: Date, timezone: string): { start: Date; end: Date } {
  const key = campDayKey(at, timezone); // YYYY-MM-DD in camp-local terms
  // Find the UTC instant that corresponds to 00:00:00 camp-local on `key` by
  // bisecting: start from midnight UTC on that calendar date and correct for
  // the timezone offset using the same formatter used to derive `key`.
  const naiveUtcMidnight = new Date(`${key}T00:00:00.000Z`);
  const offsetMinutes = getTimezoneOffsetMinutes(naiveUtcMidnight, timezone);
  const start = new Date(naiveUtcMidnight.getTime() - offsetMinutes * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000 - 1);
  return { start, end };
}

function getTimezoneOffsetMinutes(at: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - at.getTime()) / 60_000;
}
