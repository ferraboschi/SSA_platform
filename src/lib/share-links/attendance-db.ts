import "server-only";

// Shared, non-action helpers for the PUBLIC educator SHARE LINK actions
// (attendance-actions.ts + verification-actions.ts). Plain server module —
// deliberately NOT "use server" — so it can export constants and sync
// functions freely (a "use server" module may only export async functions).
//
// The share link is unauthenticated: it is a signed, expiring token that
// grants a read-only view of ONE course (src/lib/share-links/token.ts).
// Everything here supports the proven public-write posture of the two action
// files: re-verify the token, derive the course FROM the token, bind every
// client-passed id to that course, and degrade gracefully (schema flag) until
// the migrations are applied.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { courseDayCount, courseHasExam } from "@/lib/domain";
import type { CourseTypeKey } from "@/lib/domain";
import { loadCourseProgram } from "@/lib/corsi/program-load";
import { verifyShareToken } from "./token";

export const TABLE = "corsi_presenze";
export const PART_TABLE = "corsi_partecipanti";
export const ISCR_TABLE = "corsi_iscrizioni";

/** Verify the signed token and return the numeric course id it grants, or null. */
export function courseIdFromToken(token: string): number | null {
  const res = verifyShareToken(token);
  if (!res.ok) return null;
  const c = res.payload.c;
  // Attendance is per-course only; the "planner" sentinel share has no roster.
  return /^\d+$/.test(c) ? Number(c) : null;
}

export function isMissingTable(err: { message?: string } | null | undefined): boolean {
  return (
    !!err &&
    /corsi_presenze|corsi_partecipanti|partecipante_id|does not exist|schema cache|find the table|column/i.test(
      err.message || "",
    )
  );
}

/** Roll-call days for a course = its REAL editable program length (fallback:
 *  the expected baseline for type + mode). Courses with an exam also get ONE
 *  extra roll-call day for the exam day itself (day_no = dayCount + 1, the
 *  owner's "Giorno esame" appello) — `examDay` is that number, or null when
 *  there's no exam. Single source: courseDayCount/courseHasExam (@/lib/domain)
 *  + the course program overlay. */
export async function courseDayInfo(corsoId: number): Promise<{ dayCount: number; examDay: number | null }> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc.from("corsi").select("type, delivery_mode").eq("id", corsoId).maybeSingle();
  const type = ((data?.type as string) ?? "introduttivo") as CourseTypeKey;
  const mode = data?.delivery_mode === "online" ? "online" : "presenza";
  const program = (await loadCourseProgram()).get(String(corsoId));
  const dayCount = courseDayCount(type, mode, program?.days?.length ?? null);
  return { dayCount, examDay: courseHasExam(type) ? dayCount + 1 : null };
}

export function subjectKey(kind: "corsista" | "partecipante", id: number): string {
  return `${kind === "corsista" ? "c" : "p"}${id}`;
}

export function validEmail(email: string): string | null {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 254) return null;
  return clean;
}

/** Is the SUBJECT's verification in flight or done (confirm link out OR data
 *  confirmed)? Keyed the attendance way (corsista_id / partecipante id),
 *  unlike readConfirmState (iscrizione id). Two-tier select degrades on a
 *  pre-migration DB; fails open — without the columns nobody is locked. */
export async function isSubjectVerificationLocked(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  kind: "corsista" | "partecipante",
  id: number,
): Promise<boolean> {
  const from = () =>
    kind === "corsista"
      ? svc.from(ISCR_TABLE).select("email_confirmed_at, confirm_sent_at").eq("corso_id", corsoId).eq("corsista_id", id)
      : svc.from(PART_TABLE).select("email_confirmed_at, confirm_sent_at").eq("corso_id", corsoId).eq("id", id);
  const rich = await from().maybeSingle();
  if (!rich.error) {
    const r = rich.data as { email_confirmed_at: string | null; confirm_sent_at: string | null } | null;
    return Boolean(r?.email_confirmed_at || r?.confirm_sent_at);
  }
  const base =
    kind === "corsista"
      ? await svc.from(ISCR_TABLE).select("email_confirmed_at").eq("corso_id", corsoId).eq("corsista_id", id).maybeSingle()
      : await svc.from(PART_TABLE).select("email_confirmed_at").eq("corso_id", corsoId).eq("id", id).maybeSingle();
  if (base.error) return false;
  return Boolean((base.data as { email_confirmed_at: string | null } | null)?.email_confirmed_at);
}

/** Does the subject have ANOTHER day marked present (besides `exceptDay`)?
 *  Bounded to the course's REAL days (program days + the exam day, when the
 *  course has one) — a stray out-of-range row must never satisfy the
 *  invariant on behalf of the visible roster. */
export async function hasOtherPresentDay(
  svc: ReturnType<typeof getSupabaseServiceClient>,
  corsoId: number,
  kind: "corsista" | "partecipante",
  id: number,
  exceptDay: number,
  maxDay: number,
): Promise<boolean> {
  const col = kind === "corsista" ? "corsista_id" : "partecipante_id";
  const { data, error } = await svc
    .from(TABLE)
    .select("day_no")
    .eq("corso_id", corsoId)
    .eq(col, id)
    .eq("present", true)
    .neq("day_no", exceptDay)
    .gte("day_no", 1)
    .lte("day_no", maxDay)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}
