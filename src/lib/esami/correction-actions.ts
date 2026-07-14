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
import { anthropicConfig } from "@/lib/integrations/anthropic/client";
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

/** Run the batch correction for one of a course's tests (see correction-run.ts). */
export async function runCourseCorrectionAction(
  courseId: string,
  family: "nihonshu" | "shochu",
  testKey = "final",
): Promise<RunCorrectionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!/^(final|day[1-9])$/.test(testKey)) return { ok: false, error: "Test non valido." };
  // Same posture as the per-answer button: without the API key the batch must
  // REFUSE, not silently degrade to the offline heuristic stub.
  if (!anthropicConfig.isConfigured) return { ok: false, error: "AI non configurata." };
  try {
    const run = await runCourseCorrection(courseId, family, testKey as "final" | `day${number}`);
    return { ok: true, run };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Correzione non riuscita." };
  }
}

export interface CourseCorrectionData {
  /** submissionId → the last run's draft for that submission. */
  drafts: Record<number, CorrectionDraft>;
  run: CorrectionRun | null;
  /** Latest exam-template edit for the course's family — a draft older than
   *  this is STALE (template changed since the run) and the UI flags it. */
  templateUpdatedAt: string | null;
}

/** Read the persisted correction drafts + run summary for a course. Degrades
 *  gracefully: no run yet / missing table → empty drafts and a null run. */
export async function getCourseCorrectionAction(
  courseId: string,
  testKey = "final",
): Promise<CourseCorrectionData> {
  // Same auth posture as getCourseExamResultsAction (results-actions.ts).
  await assertRole(["admin", "manager"]);
  const corsoId = Number(courseId);
  const cleanTest = /^(final|day[1-9])$/.test(testKey) ? testKey : "final";
  const drafts: Record<number, CorrectionDraft> = {};
  let run: CorrectionRun | null = null;
  let templateUpdatedAt: string | null = null;
  try {
    const svc = getSupabaseServiceClient();
    const prefix = `${CORRECTION_KEY_PREFIX}${corsoId}:`;
    const [draftRes, runRes, corsoRes] = await Promise.all([
      svc.from("settings_kv").select("key, value").like("key", `${prefix}%`),
      svc.from("settings_kv").select("value").eq("key", correctionRunKey(corsoId, cleanTest)).maybeSingle(),
      svc.from("corsi").select("type").eq("id", corsoId).maybeSingle(),
    ]);
    for (const r of (draftRes.data ?? []) as Array<{ key: string; value: CorrectionDraft | null }>) {
      const submissionId = Number(r.key.slice(prefix.length));
      if (Number.isInteger(submissionId) && r.value) drafts[submissionId] = r.value;
    }
    run = ((runRes.data ?? null) as { value: CorrectionRun | null } | null)?.value ?? null;
    const family = corsoRes.data?.type === "shochu" ? "shochu" : "certificato";
    const { data: tpl } = await svc
      .from("exam_templates")
      .select("updated_at")
      .eq("family", family)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    templateUpdatedAt = (tpl?.updated_at as string | null) ?? null;
  } catch {
    /* fail soft: the Correggi tab just shows "no drafts yet" */
  }
  return { drafts, run, templateUpdatedAt };
}
