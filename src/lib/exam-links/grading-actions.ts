"use server";

// Persist an exam outcome onto the student's enrollment (corsi_iscrizioni) or —
// for a "doppio" companion — onto their corsi_partecipanti row (the enrollment
// belongs to the main corsista and must never carry a companion's result).
// Admin/manager only.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import type { ExamOutcome } from "./results";

export interface GradeResult {
  ok: boolean;
  error?: string;
}

export async function gradeEnrollmentAction(
  enrollmentId: number,
  result: ExamOutcome,
  score: number | null,
  courseId: string,
): Promise<GradeResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore." };
  }
}

/** Companion twin of gradeEnrollmentAction: writes the confirmed outcome to
 *  corsi_partecipanti.exam_result/exam_score_pct (same value domain). Clear
 *  error if the outcome columns predate the migration. */
export async function gradePartecipanteAction(
  partecipanteId: number,
  result: ExamOutcome,
  score: number | null,
  courseId: string,
): Promise<GradeResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Errore." };
  }
}
