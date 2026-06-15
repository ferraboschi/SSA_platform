"use server";

// Persist an exam outcome onto the student's enrollment (corsi_iscrizioni).
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
