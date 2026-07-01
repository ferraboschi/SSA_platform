"use server";

// Roll-call ("appello") attendance for the PUBLIC educator SHARE LINK.
//
// The share link is unauthenticated: it is a signed, expiring token that grants
// a read-only view of ONE course (src/lib/share-links/token.ts). These two
// actions let the educator toggle a per-student, per-course-day presence flag.
//
// Security posture mirrors exam-links/sessions.ts exactly (the proven public-
// write pattern):
//   • RE-VERIFY the signed token server-side on every call (never trust the
//     client) — a tampered/expired token is rejected.
//   • Derive courseId FROM THE TOKEN payload (`c`). The client NEVER passes a
//     courseId; it cannot write to a course it wasn't granted.
//   • ENROLLMENT GUARD: reject a write for a (corso_id, corsista_id) pair that
//     is not in corsi_iscrizioni — the shared token exposes every corsista_id,
//     so we must confirm the target belongs to THIS course.
//   • BOUND day_no to 1..dayCount (dayCount derived from the course type).
//   • RATE-LIMIT keyed by the token (per-instance fixed-window limiter).
//   • The corsi_presenze table is RLS-locked with NO public policy — everything
//     here goes through the service-role key. Degrades gracefully (schema flag)
//     until the migration (20260701170000) is applied.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { verifyShareToken } from "./token";

const TABLE = "corsi_presenze";

// ── Rate limiting (PER-INSTANCE, in-memory) ──────────────────────────────────
// These actions are gated only by the shared, signed share token — a scrape/DoS
// surface. Pragmatic fixed-window limiter keyed by the TOKEN (identifies the
// link/course). We do NOT read IP (not reliable in a server action). Best-effort
// only: the Map lives in one Node process, so a multi-instance deploy limits
// independently. (Replicated from exam-links/sessions.ts.)
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_READ = 30; // getAttendanceAction — hydrate on mount / refresh
const RATE_LIMIT_WRITE = 120; // setAttendanceAction — one per checkbox toggle

// key = `${bucket}:${token}` → timestamps (ms) of hits inside the current window.
const rateHits = new Map<string, number[]>();

/** Returns true when this (bucket, token) is OVER the limit for the window. */
function isRateLimited(bucket: string, token: string, limit: number): boolean {
  const now = Date.now();
  const key = `${bucket}:${token}`;
  const cutoff = now - RATE_WINDOW_MS;
  const recent = (rateHits.get(key) ?? []).filter((ts) => ts > cutoff);
  if (recent.length >= limit) {
    rateHits.set(key, recent); // keep the pruned window; do not record this hit
    return true;
  }
  recent.push(now);
  rateHits.set(key, recent);
  pruneRateHits(cutoff);
  return false;
}

// Bound the sweep so a large launch never turns a single request into an O(n)
// scan of every token ever seen.
const RATE_PRUNE_SCAN = 50;
/** Drop keys whose entire window has expired (best-effort, capped scan). */
function pruneRateHits(cutoff: number): void {
  let scanned = 0;
  for (const [k, ts] of rateHits) {
    if (scanned++ >= RATE_PRUNE_SCAN) break;
    if (ts.length === 0 || ts[ts.length - 1] <= cutoff) rateHits.delete(k);
  }
}

/** Verify the signed token and return the numeric course id it grants, or null. */
function courseIdFromToken(token: string): number | null {
  const res = verifyShareToken(token);
  if (!res.ok) return null;
  const c = res.payload.c;
  // Attendance is per-course only; the "planner" sentinel share has no roster.
  return /^\d+$/.test(c) ? Number(c) : null;
}

function isMissingTable(err: { message?: string } | null | undefined): boolean {
  return !!err && /corsi_presenze|does not exist|schema cache|find the table/i.test(err.message || "");
}

/** Roll-call days for a course: Certificato = 3, everything else = 1.
 *  (Kept in sync with SharedCourse.dayCount in src/lib/share-links/load.ts.) */
async function courseDayCount(corsoId: number): Promise<number> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
  return (data?.type as string | undefined) === "certificato" ? 3 : 1;
}

export type AttendanceMap = Record<number, Record<number, boolean>>;

/**
 * PUBLIC: read all attendance for the shared course as
 * `{ [corsistaId]: { [dayNo]: boolean } }`. Degrades to `{}` (and schema:true)
 * if the table is missing so the roster can render read-only.
 */
export async function getAttendanceAction(
  token: string,
): Promise<{ ok: boolean; attendance?: AttendanceMap; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (isRateLimited("read", token, RATE_LIMIT_READ)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from(TABLE)
    .select("corsista_id, day_no, present")
    .eq("corso_id", corsoId);
  if (error) {
    if (isMissingTable(error)) return { ok: true, schema: true, attendance: {} };
    return { ok: false, error: error.message };
  }

  const attendance: AttendanceMap = {};
  for (const r of (data ?? []) as { corsista_id: number; day_no: number; present: boolean }[]) {
    (attendance[r.corsista_id] ??= {})[r.day_no] = !!r.present;
  }
  return { ok: true, attendance };
}

/**
 * PUBLIC: set one presence flag. courseId comes ONLY from the verified token —
 * never from the client. Enforces enrollment + day_no bounds + rate limit.
 */
export async function setAttendanceAction(
  token: string,
  corsistaId: number,
  dayNo: number,
  present: boolean,
): Promise<{ ok: boolean; error?: string; schema?: boolean }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (isRateLimited("write", token, RATE_LIMIT_WRITE)) return { ok: false, error: "Troppe richieste, riprova tra poco." };

  // Coerce + sanity-check the client inputs before any DB work.
  const corsista = Number(corsistaId);
  const day = Math.trunc(Number(dayNo));
  if (!Number.isInteger(corsista) || corsista <= 0) return { ok: false, error: "Corsista non valido." };

  const svc = getSupabaseServiceClient();

  // ENROLLMENT GUARD: the target student must be enrolled in THIS course. The
  // shared token exposes every corsista_id, so without this a link holder could
  // stamp presence onto a student from another course.
  const { data: enr, error: enrErr } = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id")
    .eq("corso_id", corsoId)
    .eq("corsista_id", corsista)
    .maybeSingle();
  if (enrErr) return { ok: false, error: enrErr.message };
  if (!enr) return { ok: false, error: "Studente non iscritto a questo corso." };

  // BOUND day_no to 1..dayCount for the course's actual type.
  const dayCount = await courseDayCount(corsoId);
  if (!Number.isInteger(day) || day < 1 || day > dayCount) {
    return { ok: false, error: "Giornata non valida." };
  }

  const { error } = await svc
    .from(TABLE)
    .upsert(
      { corso_id: corsoId, corsista_id: corsista, day_no: day, present: !!present, updated_at: new Date().toISOString() },
      { onConflict: "corso_id,corsista_id,day_no" },
    );
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Appello non disponibile (migrazione mancante)." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
