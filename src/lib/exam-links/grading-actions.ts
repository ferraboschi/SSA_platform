"use server";

// Persist an exam outcome onto the student's enrollment (corsi_iscrizioni) or —
// for a "doppio" companion — onto their corsi_partecipanti row (the enrollment
// belongs to the main corsista and must never carry a companion's result).
// Admin/manager only. The publication gates the Esiti UI applies are
// RE-VERIFIED here (AGENTS rules 2, 5, 5b): a removed seat never takes an
// outcome, and a final exam whose open answers were never evaluated (no
// correction draft, or failed AI grades) is not publishable.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import { revalidateClassAverage } from "@/lib/esami/class-average";
import { correctionKey, type CorrectionDraft } from "@/lib/esami/correction-types";
import { loadCourseExamResults, type ExamOutcome } from "./results";

export interface GradeResult {
  ok: boolean;
  error?: string;
}

const ANNULLATA_ERROR = "Posto rimosso dal corso: l'esito non si registra su un'iscrizione annullata.";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

/** Publication gate for the hand-in being confirmed: it must be THIS subject's
 *  final exam, and its open lane must be settled — every answered open question
 *  needs a grade in the correction draft (AI or educator's vote), none failed.
 *  Without a draft at all (e.g. the submit-time background correction was lost
 *  on a deploy) the objective % alone would certify the outcome: refused.
 *  Returns the refusal message, or null when publishable. */
async function publicationError(
  svc: Svc,
  courseId: string,
  submissionId: number,
  subject: { enrollmentId: number } | { partecipanteId: number },
): Promise<string | null> {
  const corsoId = Number(courseId);
  const { data: corso } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
  const family = corso?.type === "shochu" ? "shochu" : "nihonshu";
  const sub = (await loadCourseExamResults(courseId, family)).find((s) => s.id === submissionId);
  if (!sub) return "Consegna non trovata.";
  if (sub.testKey !== "final") return "L'esito si conferma solo sulla consegna dell'esame finale.";
  const sameSubject =
    "enrollmentId" in subject
      ? sub.enrollmentId === subject.enrollmentId
      : sub.partecipanteId === subject.partecipanteId;
  if (!sameSubject) return "La consegna non appartiene a questo iscritto.";
  if (sub.annullata) return ANNULLATA_ERROR;

  // Same predicate as the correction engine's open lane (correction-run.ts):
  // answered but objectively ungradeable. Blanks are already closed as wrong.
  const openAnswered = sub.answers.some((a) => a.ok === null && a.given !== "" && a.given !== "—");
  if (!openAnswered) return null;
  const { data: row } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", correctionKey(corsoId, submissionId))
    .maybeSingle();
  const draft = (row?.value as CorrectionDraft | null) ?? null;
  if (!draft) return "Risposte aperte non ancora valutate: esegui Correggi (o assegna un voto educator).";
  const failed = draft.totals?.openFailed ?? 0;
  if (failed > 0) {
    return `${failed} ${failed === 1 ? "risposta aperta non è stata valutata" : "risposte aperte non sono state valutate"}: assegna un voto educator (1-5) prima di pubblicare l'esito.`;
  }
  return null;
}

/** The enrollment's seat state, read fresh (never trusted from the client).
 *  Degrades to "active" on a pre-migration schema without annullata_at. */
async function enrollmentSeat(
  svc: Svc,
  enrollmentId: number,
): Promise<{ corso_id: number | null; annullata: boolean } | null> {
  const withSeat = await svc
    .from("corsi_iscrizioni")
    .select("id, corso_id, annullata_at")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!withSeat.error) {
    const r = withSeat.data as { corso_id: number | null; annullata_at: string | null } | null;
    return r ? { corso_id: r.corso_id, annullata: Boolean(r.annullata_at) } : null;
  }
  if (!/annullata_at|column/i.test(withSeat.error.message)) throw withSeat.error;
  const { data, error } = await svc
    .from("corsi_iscrizioni")
    .select("id, corso_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) throw error;
  const r = data as { corso_id: number | null } | null;
  return r ? { corso_id: r.corso_id, annullata: false } : null;
}

/** `submissionId` is the hand-in the outcome is confirmed from (the Esiti row):
 *  it drives the server-side publication gate. Callers that confirm without a
 *  hand-in may omit it — the seat check still applies, the open-lane gate can't. */
export async function gradeEnrollmentAction(
  enrollmentId: number,
  result: ExamOutcome,
  score: number | null,
  courseId: string,
  submissionId?: number,
): Promise<GradeResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
    const seat = await enrollmentSeat(svc, enrollmentId);
    if (!seat) return { ok: false, error: "Iscrizione non trovata." };
    if (seat.corso_id !== Number(courseId)) return { ok: false, error: "L'iscrizione appartiene a un altro corso." };
    if (seat.annullata) return { ok: false, error: ANNULLATA_ERROR };
    if (submissionId != null) {
      const blocked = await publicationError(svc, courseId, submissionId, { enrollmentId });
      if (blocked) return { ok: false, error: blocked };
    }
    const { error } = await svc
      .from("corsi_iscrizioni")
      .update({
        exam_result: result,
        exam_score_pct: score == null ? null : Math.max(0, Math.min(100, Math.round(score))),
      })
      .eq("id", enrollmentId);
    if (error) throw error;
    revalidatePath(`/esami/${courseId}/risultati`);
    revalidatePath(`/esami/${courseId}`);
    revalidatePath("/corsisti");
    // A new confirmed score shifts the cohort media printed on certificates.
    revalidateClassAverage();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore." };
  }
}

/** Companion twin of gradeEnrollmentAction: writes the confirmed outcome to
 *  corsi_partecipanti.exam_result/exam_score_pct (same value domain, same
 *  publication gate). Clear error if the outcome columns predate the migration. */
export async function gradePartecipanteAction(
  partecipanteId: number,
  result: ExamOutcome,
  score: number | null,
  courseId: string,
  submissionId?: number,
): Promise<GradeResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
    if (submissionId != null) {
      const blocked = await publicationError(svc, courseId, submissionId, { partecipanteId });
      if (blocked) return { ok: false, error: blocked };
    }
    const { error } = await svc
      .from("corsi_partecipanti")
      .update({
        exam_result: result,
        exam_score_pct: score == null ? null : Math.max(0, Math.min(100, Math.round(score))),
      })
      .eq("id", partecipanteId);
    if (error) {
      if (/exam_result|exam_score_pct|column/i.test(error.message)) {
        return { ok: false, error: "Esito partecipante non salvabile (migrazione mancante)." };
      }
      throw error;
    }
    revalidatePath(`/esami/${courseId}/risultati`);
    revalidatePath(`/esami/${courseId}`);
    revalidateClassAverage();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore." };
  }
}
