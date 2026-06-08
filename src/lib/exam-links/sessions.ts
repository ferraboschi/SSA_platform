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

/** PUBLIC: the enrolled roster for the name picker (only for the real exam link). */
export async function getExamRosterAction(
  token: string,
): Promise<{ ok: boolean; courseRef?: string; students?: { id: number; name: string }[]; error?: string }> {
  const ctx = tokenCtx(token);
  if (!ctx) return { ok: false, error: "Link non valido o scaduto." };
  if (ctx.m !== "exam") return { ok: false, error: "Disponibile solo per l'esame reale." };
  if (ctx.corsoId == null) return { ok: false, error: "Corso non valido." };
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
): Promise<{ ok: boolean; state?: ExamSessionState; error?: string; schema?: boolean }> {
  const ctx = tokenCtx(token);
  if (!ctx) return { ok: false, error: "Link non valido o scaduto." };
  if (ctx.m !== "exam") return { ok: false, error: "Disponibile solo per l'esame reale." };
  if (ctx.corsoId == null) return { ok: false, error: "Corso non valido." };
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
  if (existing) return { ok: true, state: rowToState(existing as SessionRow) };

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
    return { ok: false, error: insErr.message };
  }
  return { ok: true, state: rowToState(ins as SessionRow) };
}

/** PUBLIC: poll the session (waiting-room → admitted, and resume on reconnect). */
export async function getExamSessionAction(
  token: string,
  corsistaId: number,
): Promise<{ ok: boolean; state?: ExamSessionState; error?: string }> {
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from(TABLE)
    .select("*")
    .eq("token", token)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Sessione non trovata." };
  return { ok: true, state: rowToState(data as SessionRow) };
}

/** PUBLIC: persist progress (frequent). Never touches a submitted session. */
export async function saveExamProgressAction(
  token: string,
  corsistaId: number,
  patch: { answers: Record<string, string[] | string>; currentIdx: number; lang?: string; elapsed?: number },
): Promise<{ ok: boolean }> {
  const svc = getSupabaseServiceClient();
  await svc
    .from(TABLE)
    .update({
      answers: patch.answers,
      current_idx: patch.currentIdx,
      lang: patch.lang ?? null,
      elapsed_seconds: patch.elapsed ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("corsista_id", corsistaId)
    .neq("status", "submitted");
  return { ok: true };
}

/** PUBLIC: finalize — write the graded submission and mark the session submitted. */
export async function submitExamSessionAction(
  token: string,
  corsistaId: number,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = tokenCtx(token);
  if (!ctx) return { ok: false, error: "Link non valido o scaduto." };
  const svc = getSupabaseServiceClient();
  const { data: sess, error } = await svc
    .from(TABLE)
    .select("*")
    .eq("token", token)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!sess) return { ok: false, error: "Sessione non trovata." };
  const row = sess as SessionRow & { lang: string | null; elapsed_seconds: number };
  if (row.status === "submitted") return { ok: true }; // idempotent

  const all = (row.answers ?? {}) as Record<string, string[] | string>;
  const registration: Record<string, string> = {};
  const answers: Record<string, string[] | string> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith("reg:")) registration[k.slice(4)] = Array.isArray(v) ? v.join(", ") : v;
    else answers[k] = v;
  }
  const subRow = {
    corso_id: ctx.corsoId,
    course_ref: ctx.c,
    test_key: ctx.t,
    mode: "exam",
    lang: row.lang ?? null,
    elapsed_seconds: row.elapsed_seconds ?? null,
    answers,
    registration: Object.keys(registration).length ? registration : null,
  };
  let { error: subErr } = await svc.from("exam_submissions").insert({ ...subRow, corsista_id: corsistaId });
  if (subErr && /corsista_id/i.test(subErr.message)) {
    ({ error: subErr } = await svc.from("exam_submissions").insert(subRow));
  }
  if (subErr) return { ok: false, error: subErr.message };

  await svc.from(TABLE).update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", row.id);
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
