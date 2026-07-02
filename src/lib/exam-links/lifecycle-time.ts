// Pure time helper for the exam-link lifecycle (no server-only import so it can
// be unit-tested).

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
function dateInZone(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Epoch seconds of the END OF THE CURRENT DAY in `tz` (the last second before
 * local midnight). DST-proof: scans forward in 15-minute steps until the local
 * calendar date flips, then backs off one second. Bounded (<50h) by construction.
 */
export function endOfDayEpochSeconds(tz: string, now: Date): number {
  const today = dateInZone(tz, now);
  const step = 15 * 60 * 1000;
  let t = now.getTime();
  for (let i = 0; i < 200; i++) {
    const next = t + step;
    if (dateInZone(tz, new Date(next)) !== today) {
      // Midnight is within (t, next] — narrow minute by minute.
      let m = t;
      while (dateInZone(tz, new Date(m + 60_000)) === today) m += 60_000;
      // m + 60s is past midnight to the minute; the last in-day second is ≤ m+59s.
      let s = m;
      while (dateInZone(tz, new Date(s + 1000)) === today) s += 1000;
      return Math.floor(s / 1000);
    }
    t = next;
  }
  // Unreachable for real time zones; fall back to +24h.
  return Math.floor((now.getTime() + 24 * 3600 * 1000) / 1000);
}
