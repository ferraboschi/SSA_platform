"use server";

// Manual grading of ONE open answer by the educator — the fallback that keeps an
// exam publishable when the AI correction cannot grade it (provider outage or
// quota, "nessun contenuto pertinente", malformed model output). The vote lands
// in the same draft store the batch "Correggi" writes, so the Esiti tab, the
// bozza PDF and the student's day-test esito all read one consistent draft.
// Core logic in correction-run.ts (applyManualOpenGrade); here only the guard.

import { hasRole } from "@/lib/auth/guard";
import { applyManualOpenGrade } from "./correction-run";
import type { CorrectionDraft } from "./correction-types";

export interface ManualGradeResult {
  ok: boolean;
  error?: string;
  draft?: CorrectionDraft;
}

export async function setManualOpenGradeAction(input: {
  courseId: string;
  family: "nihonshu" | "shochu";
  testKey: string;
  submissionId: number;
  qid: string;
  vote: number;
}): Promise<ManualGradeResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!/^(final|day[1-9])$/.test(input.testKey)) return { ok: false, error: "Test non valido." };
  if (input.family !== "nihonshu" && input.family !== "shochu") return { ok: false, error: "Famiglia esame non valida." };
  try {
    return await applyManualOpenGrade(
      input.courseId,
      input.family,
      input.testKey,
      Number(input.submissionId),
      String(input.qid),
      Number(input.vote),
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
