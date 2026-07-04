"use server";

// Batch exam correction — the "Correggi" actions. Admin/manager triggers a run
// once per course: every FINAL submission is deduped per student, its open
// answers are AI-graded against the SSA knowledge base, and the resulting DRAFT
// (advisory — staff confirms in Esiti) is persisted to settings_kv under
// `exam-correction:<corsoId>:<submissionId>`, plus one run summary per course.
// The core logic lives in correction-run.ts (shared with integration tests) —
// these actions only add the auth guard.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { assertRole, hasRole } from "@/lib/auth/guard";
import { runCourseCorrection } from "./correction-run";
import {
  CORRECTION_KEY_PREFIX,
  correctionRunKey,
  type CorrectionDraft,
  type CorrectionRun,
} from "./correction-types";

export interface RunCorrectionResult {
  ok: boolean;
  run?: CorrectionRun;
  error?: string;
}

/** Run the batch correction for a course's FINAL exam (see correction-run.ts). */
export async function runCourseCorrectionAction(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<RunCorrectionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  try {
    const run = await runCourseCorrection(courseId, family);
    return { ok: true, run };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Correzione non riuscita." };
  }
}

export interface CourseCorrectionData {
  /** submissionId → the last run's draft for that submission. */
  drafts: Record<number, CorrectionDraft>;
  run: CorrectionRun | null;
}

/** Read the persisted correction drafts + run summary for a course. Degrades
 *  gracefully: no run yet / missing table → empty drafts and a null run. */
export async function getCourseCorrectionAction(courseId: string): Promise<CourseCorrectionData> {
  // Same auth posture as getCourseExamResultsAction (results-actions.ts).
  await assertRole(["admin", "manager"]);
  const corsoId = Number(courseId);
  const drafts: Record<number, CorrectionDraft> = {};
  let run: CorrectionRun | null = null;
  try {
    const svc = getSupabaseServiceClient();
    const prefix = `${CORRECTION_KEY_PREFIX}${corsoId}:`;
    const [draftRes, runRes] = await Promise.all([
      svc.from("settings_kv").select("key, value").like("key", `${prefix}%`),
      svc.from("settings_kv").select("value").eq("key", correctionRunKey(corsoId)).maybeSingle(),
    ]);
    for (const r of (draftRes.data ?? []) as Array<{ key: string; value: CorrectionDraft | null }>) {
      const submissionId = Number(r.key.slice(prefix.length));
      if (Number.isInteger(submissionId) && r.value) drafts[submissionId] = r.value;
    }
    run = ((runRes.data ?? null) as { value: CorrectionRun | null } | null)?.value ?? null;
  } catch {
    /* fail soft: the Correggi tab just shows "no drafts yet" */
  }
  return { drafts, run };
}
