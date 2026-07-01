// Per-instance, in-memory fixed-window rate limiter (factory).
//
// Extracted verbatim from the duplicated limiters in
// src/lib/share-links/attendance-actions.ts and src/lib/exam-links/sessions.ts.
// Each factory call closes over its OWN Map, so distinct callers limit
// independently. Best-effort only: the Map lives in a single Node process, so a
// multi-instance deploy limits per-instance. The hardened version would use a
// shared store (Supabase/Redis) with an atomic increment.
//
// Semantics (preserved exactly):
//   • Fixed window of `windowMs`, keyed by `${bucket}:${key}`.
//   • OVER the limit → return true and DO NOT record the hit (so the over-limit
//     call neither consumes a slot nor extends the window).
//   • Otherwise → record the hit + opportunistically prune fully-expired keys,
//     capped at `pruneScan` keys so a single request never becomes an O(n) scan.

export interface FixedWindowLimiter {
  /** Returns true when this (bucket, key) is OVER the limit for the window. */
  isLimited(bucket: string, key: string, limit: number, now?: number): boolean;
}

/**
 * Build an isolated fixed-window limiter over its own private Map.
 * @param windowMs window length in milliseconds
 * @param opts.pruneScan max keys swept per prune pass (default 50)
 */
export function createFixedWindowLimiter(
  windowMs: number,
  opts?: { pruneScan?: number },
): FixedWindowLimiter {
  const pruneScan = opts?.pruneScan ?? 50;
  // key = `${bucket}:${key}` → timestamps (ms) of hits inside the current window.
  const rateHits = new Map<string, number[]>();

  // Drop keys whose entire window has expired (best-effort, capped scan).
  function pruneRateHits(cutoff: number): void {
    let scanned = 0;
    for (const [k, ts] of rateHits) {
      if (scanned++ >= pruneScan) break;
      if (ts.length === 0 || ts[ts.length - 1] <= cutoff) rateHits.delete(k);
    }
  }

  function isLimited(bucket: string, key: string, limit: number, now: number = Date.now()): boolean {
    const mapKey = `${bucket}:${key}`;
    const cutoff = now - windowMs;
    const recent = (rateHits.get(mapKey) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= limit) {
      rateHits.set(mapKey, recent); // keep the pruned window; do not record this hit
      return true;
    }
    recent.push(now);
    rateHits.set(mapKey, recent);
    pruneRateHits(cutoff);
    return false;
  }

  return { isLimited };
}
