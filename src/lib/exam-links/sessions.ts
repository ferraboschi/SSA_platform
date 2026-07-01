"use server";

// Resumable, proctored exam sessions (see migration 20260608120000).
// PUBLIC (token-gated) actions for the student runner: roster, check-in, resume,
// save-progress, submit. AUTH (admin/manager) actions for the educator admission
// panel: list + admit. Everything goes through the service-role key; the table
// is RLS-locked. Degrades gracefully (schema flag) until the migration is applied.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { assertRole } from "@/lib/auth/guard";
import { verifyExamToken } from "./token";

const TABLE = "exam_sessions";

// ── Rate limiting (PER-INSTANCE, in-memory) ──────────────────────────────────
// The public runner actions below are unauthenticated: gated only by a shared,
// signed class token — a scrape/DoS surface at a global launch. This is a
// pragmatic fixed-window limiter keyed by the exam TOKEN (the argument every
// action already receives; it identifies the class/link). We do NOT read IP —
// it isn't reliably available in a server action.
//
// IMPORTANT: this Map lives in a single Node process. On a multi-instance
// deploy each instance limits independently, so it's best-effort only. The
// hardened version would use a shared store (Supabase/Redis) with an atomic
// increment. Date.now() is fine here — this is app code, not a workflow script.
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_POLL = 40; // getExamSession — the ~3s waiting-room poll
const RATE_LIMIT_SAVE = 60; // saveExamProgress — frequent debounced writes
const RATE_LIMIT_ROSTER = 20; // getExamRoster + checkIn
const RATE_LIMIT_SUBMIT = 10; // submit — finalize

// key = `${bucket}:${token}` → timestamps (ms) of hits inside the current window.
const rateHits = new Map<string, number[]>();

/** Returns true when this (bucket, token) is OVER the limit for the window. */
function isRateLimited(bucket: string, token: string, limit: number): boolean {
  const now = Date.now();
  const key = `${bucket}:${token}`;
  const cutoff = now - RATE_WINDOW_MS;
  // Prune timestamps outside the window so each array (and the Map) can't grow
  // unbounded.
  const recent = (rateHits.get(key) ?? []).filter((ts) => ts > cutoff);
  if (recent.length >= limit) {
    rateHits.set(key, recent); // keep the pruned window; do not record this hit
    return true;
  }
  recent.push(now);
  rateHits.set(key, recent);
  // Opportunistically evict fully-expired keys so abandoned tokens (a class
  // that has finished) don't linger in the Map forever. Cheap: capped scan.
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

export type ExamSessionStatus = "checked_in" | "admitted" | "submitted";

export interface ExamSessionState {
  status: ExamSessionStatus;
  lang: string | null;
  currentIdx: number;
  answers: Record<string, string[] | string>;
  elapsed: number;
  studentName: string;
}

interface TokenCtx {
  c: string;
  t: string;
  m: string;
  corsoId: number | null;
}
function tokenCtx(token: string): TokenCtx | null {
  const res = verifyExamToken(token);
  if (!res.ok) return null;
  const { c, t, m } = res.payload;
  return { c, t, m, corsoId: /^\d+$/.test(c) ? Number(c) : null };
}

function isMissingTable(err: { message?: string } | null | undefined): boolean {
  return !!err && /exam_sessions|does not exist|schema cache|find the table/i.test(err.message || "");
}

interface SessionRow {
  id: number;
  status: ExamSessionStatus;
  lang: string | null;
  current_idx: number;
  answers: Record<string, string[] | string> | null;
  elapsed_seconds: number;
  student_name: string;
  // Present once migration 20260608120000 is applied; undefined before then.
  session_secret?: string | null;
  // Set at check-in from the verified token — submit builds the graded row from
  // THESE, never re-deriving from the token (which may have expired mid-exam).
  course_ref?: string;
  corso_id?: number | null;
  test_key?: string;
  corsista_id?: number | null;
}
function rowToState(r: SessionRow): ExamSessionState {
  return {
    status: r.status,
    lang: r.lang ?? null,
    currentIdx: r.current_idx ?? 0,
    answers: (r.answers ?? {}) as Record<string, string[] | string>,
    elapsed: r.elapsed_seconds ?? 0,
    studentName: r.student_name,
  };
}

/**
 * Load a session by (token, corsista) and enforce the per-session secret.
 *
 * The class token is shared with everyone and the roster exposes every
 * corsista_id, so this secret — handed out ONLY at check-in — is what stops a
 * classmate from reading/tampering with another student's session through the
 * API. Enforced server-side: once the `session_secret` column exists, a request
 * with a wrong/absent secret is rejected (a client can't bypass by omitting it).
 * Before the migration the column is absent → check is skipped (degrades
 * gracefully; there are no live exams in that window).
 */
async function loadOwnedSession(
  token: string,
  corsistaId: number,
  secret: string | undefined,
): Promise<{ ok: boolean; row?: SessionRow; error?: string; schema?: boolean }> {
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from(TABLE)
    .select("*")
    .eq("token", token)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { ok: false, schema: true, error: "Sessioni esame non disponibili (migrazione mancante)." };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "Sessione non trovata." };
  const row = data as SessionRow;
  if (row.session_secret != null && row.session_secret !== secret) {
    return { ok: false, error: "Sessione non valida." };
  }
  return { ok: true, row };
}

/** PUBLIC: the enrolled roster for the name picker (only for the real exam link). */
export async function getExamRosterAction(
  token: string,
): Promise<{ ok: boolean; courseRef?: string; students?: { id: number; name: string }[]; error?: string }> {
  const ctx = tokenCtx(token);
  if (!ctx) return { ok: false, error: "Link non valido o scaduto." };
  if (ctx.m !== "exam") return { ok: false, error: "Disponibile solo per l'esame reale." };
  if (ctx.corsoId == null) return { ok: false, error: "Corso non valido." };
  if (isRateLimited("roster", token, RATE_LIMIT_ROSTER)) return { ok: false, error: "Troppe richieste, riprova tra poco." };
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id, corsisti(id, full_name)")
    .eq("corso_id", ctx.corsoId);
  if (error) return { ok: false, error: error.message };
  type Row = { corsisti: { id: number; full_name: string } | { id: number; full_name: string }[] | null };
  const students = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const cor = Array.isArray(r.corsisti) ? r.corsisti[0] : r.corsisti;
      return cor ? { id: cor.id, name: cor.full_name } : null;
    })
    .filter((x): x is { id: number; name: string } => x != null)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, courseRef: ctx.c, students };
}

/** PUBLIC: the student picks their name → create the session, or resume the
 *  existing one (preserving admission + answers + position). */
export async function checkInExamSessionAction(
  token: string,
  corsistaId: number,
  studentName: string,
): Promise<{ ok: boolean; state?: ExamSessionState; secret?: string; error?: string; schema?: boolean }> {
  const ctx = tokenCtx(token);
  if (!ctx) return { ok: false, error: "Link non valido o scaduto." };
  if (ctx.m !== "exam") return { ok: false, error: "Disponibile solo per l'esame reale." };
  if (ctx.corsoId == null) return { ok: false, error: "Corso non valido." };
  if (isRateLimited("roster", token, RATE_LIMIT_ROSTER)) return { ok: false, error: "Troppe richieste, riprova tra poco." };
  const svc = getSupabaseServiceClient();

  // The picked student must be enrolled in this course.
  const { data: enr } = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id")
    .eq("corso_id", ctx.corsoId)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (!enr) return { ok: false, error: "Studente non iscritto a questo corso." };

  const { data: existing, error: selErr } = await svc
    .from(TABLE)
    .select("*")
    .eq("token", token)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (selErr && isMissingTable(selErr)) {
    return { ok: false, schema: true, error: "Sessioni esame non disponibili (migrazione mancante)." };
  }
  // Resume: hand back the SAME secret so a reconnecting student (who lost their
  // localStorage) can keep saving/submitting. This is the accepted impersonation
  // surface — a classmate re-picking your name would also get it — which is why
  // the educator's Zoom-video admission, not the secret, is the identity gate.
  if (existing) {
    const row = existing as SessionRow;
    return { ok: true, state: rowToState(row), secret: row.session_secret ?? undefined };
  }

  const { data: ins, error: insErr } = await svc
    .from(TABLE)
    .insert({
      token,
      course_ref: ctx.c,
      corso_id: ctx.corsoId,
      test_key: ctx.t,
      corsista_id: corsistaId,
      student_name: studentName,
      status: "checked_in",
    })
    .select("*")
    .single();
  if (insErr) {
    if (isMissingTable(insErr)) return { ok: false, schema: true, error: "Sessioni esame non disponibili (migrazione mancante)." };
    // A concurrent first check-in (double-click / two tabs) loses the unique
    // (token, corsista_id) race — fetch the winner's row instead of erroring.
    if (/duplicate key|unique|23505/i.test(insErr.message)) {
      const { data: again } = await svc
        .from(TABLE).select("*").eq("token", token).eq("corsista_id", corsistaId).maybeSingle();
      if (again) {
        const row = again as SessionRow;
        return { ok: true, state: rowToState(row), secret: row.session_secret ?? undefined };
      }
    }
    return { ok: false, error: insErr.message };
  }
  const row = ins as SessionRow;
  return { ok: true, state: rowToState(row), secret: row.session_secret ?? undefined };
}

/** PUBLIC: poll the session (waiting-room → admitted, and resume on reconnect). */
export async function getExamSessionAction(
  token: string,
  corsistaId: number,
  secret?: string,
): Promise<{ ok: boolean; state?: ExamSessionState; error?: string }> {
  if (isRateLimited("poll", token, RATE_LIMIT_POLL)) return { ok: false, error: "Troppe richieste, riprova tra poco." };
  const r = await loadOwnedSession(token, corsistaId, secret);
  if (!r.ok || !r.row) return { ok: false, error: r.error };
  return { ok: true, state: rowToState(r.row) };
}

/** PUBLIC: persist progress (frequent). Never touches a submitted session. */
export async function saveExamProgressAction(
  token: string,
  corsistaId: number,
  secret: string | undefined,
  patch: { answers: Record<string, string[] | string>; currentIdx: number; lang?: string; elapsed?: number },
): Promise<{ ok: boolean }> {
  // Save has no error channel — over the limit we just decline this write; the
  // runner keeps the answers in memory and retries on the next debounce tick.
  if (isRateLimited("save", token, RATE_LIMIT_SAVE)) return { ok: false };
  // Verify ownership (per-session secret) before writing anything.
  const r = await loadOwnedSession(token, corsistaId, secret);
  if (!r.ok || !r.row) return { ok: false };
  // Monotonic guard: never let a STALE writer overwrite newer progress. The
  // exam clock only moves forward within a live runner, so a save whose elapsed
  // is meaningfully BEHIND what's stored is a second/old tab or a late, reordered
  // request — drop it rather than rewind the student's answers + position.
  const stored = r.row.elapsed_seconds ?? 0;
  if (patch.elapsed != null && patch.elapsed + 5 < stored) return { ok: true };
  const svc = getSupabaseServiceClient();
  await svc
    .from(TABLE)
    .update({
      answers: patch.answers,
      current_idx: patch.currentIdx,
      lang: patch.lang ?? null,
      elapsed_seconds: patch.elapsed ?? stored,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.row.id)
    .neq("status", "submitted");
  return { ok: true };
}

/** PUBLIC: finalize — write the graded submission and mark the session submitted. */
export async function submitExamSessionAction(
  token: string,
  corsistaId: number,
  secret?: string,
  // The runner's FINAL client state. Used so the graded row reflects the very
  // last edit, not just the ≤1s-debounced copy already saved to the session.
  final?: { answers: Record<string, string[] | string>; lang?: string; elapsed?: number },
): Promise<{ ok: boolean; error?: string }> {
  if (isRateLimited("submit", token, RATE_LIMIT_SUBMIT)) return { ok: false, error: "Troppe richieste, riprova tra poco." };
  const svc = getSupabaseServiceClient();
  const owned = await loadOwnedSession(token, corsistaId, secret);
  if (!owned.ok || !owned.row) return { ok: false, error: owned.error || "Sessione non trovata." };
  const row = owned.row;
  if (row.status === "submitted") return { ok: true }; // idempotent

  // Claim the session ATOMICALLY first: only the update that flips a not-yet-
  // submitted row to "submitted" wins. A concurrent/duplicate submit updates
  // zero rows and returns ok without inserting again → no double graded row.
  const { data: claimed } = await svc
    .from(TABLE)
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", row.id)
    .neq("status", "submitted")
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: true };

  const all = (final?.answers ?? row.answers ?? {}) as Record<string, string[] | string>;
  const registration: Record<string, string> = {};
  const answers: Record<string, string[] | string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith("reg:")) registration[k.slice(4)] = Array.isArray(v) ? v.join(", ") : v;
    else answers[k] = v;
  }
  // Make the submission self-identifying. The proctored flow knows exactly who
  // this is (they picked their name → corsista_id), so the ENROLLED corsista is
  // AUTHORITATIVE — it overrides anything typed, so a student can never stamp
  // another person's email onto their submission (which would mis-route the
  // certificate). Falls back to the picked name when the corsista row is absent.
  let regName = row.student_name;
  let regEmail = "";
  if (corsistaId != null) {
    const { data: cor } = await svc
      .from("corsisti").select("full_name, email").eq("id", corsistaId).maybeSingle();
    if (cor) {
      const c = cor as { full_name: string | null; email: string | null };
      regName = c.full_name || row.student_name;
      regEmail = c.email || "";
    }
  }
  if (regName) registration.name = regName;
  if (regEmail) registration.email = regEmail;

  const subRow = {
    corso_id: row.corso_id ?? null,
    course_ref: row.course_ref ?? String(row.corso_id ?? ""),
    test_key: row.test_key ?? "final",
    mode: "exam",
    lang: final?.lang ?? row.lang ?? null,
    elapsed_seconds: final?.elapsed ?? row.elapsed_seconds ?? null,
    answers,
    registration: Object.keys(registration).length ? registration : null,
  };
  let { error: subErr } = await svc.from("exam_submissions").insert({ ...subRow, corsista_id: corsistaId });
  if (subErr && /corsista_id/i.test(subErr.message)) {
    // Legacy schema without corsista_id column — fall back to email-keyed row.
    ({ error: subErr } = await svc.from("exam_submissions").insert(subRow));
  }
  if (subErr) {
    // The unique backstop fired → a graded row already exists: treat as done.
    if (/duplicate key|unique|23505/i.test(subErr.message)) return { ok: true };
    // Real failure → roll the claim back so the student can retry the submit.
    await svc.from(TABLE).update({ status: "admitted", submitted_at: null }).eq("id", row.id);
    return { ok: false, error: subErr.message };
  }
  return { ok: true };
}

export interface ExamSessionRow {
  id: number;
  corsista_id: number | null;
  student_name: string;
  status: ExamSessionStatus;
  current_idx: number;
  elapsed_seconds: number;
  checked_in_at: string;
  admitted_at: string | null;
  submitted_at: string | null;
  updated_at: string;
}

/** AUTH: the live admission panel — who's checked in / admitted / submitted. */
export async function listExamSessionsAction(
  courseId: string,
  testKey: string,
): Promise<{ ok: boolean; sessions?: ExamSessionRow[]; error?: string }> {
  await assertRole(["admin", "manager"]);
  const corsoId = /^\d+$/.test(courseId) ? Number(courseId) : null;
  if (corsoId == null) return { ok: false, error: "Corso non valido." };
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from(TABLE)
    .select("id, corsista_id, student_name, status, current_idx, elapsed_seconds, checked_in_at, admitted_at, submitted_at, updated_at")
    .eq("corso_id", corsoId)
    .eq("test_key", testKey)
    .order("checked_in_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { ok: true, sessions: [] };
    return { ok: false, error: error.message };
  }
  return { ok: true, sessions: (data ?? []) as ExamSessionRow[] };
}

/** AUTH: admit a checked-in student (after verifying identity on Zoom). */
export async function admitExamSessionAction(sessionId: number): Promise<{ ok: boolean }> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  await svc
    .from(TABLE)
    .update({ status: "admitted", admitted_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "checked_in");
  return { ok: true };
}
