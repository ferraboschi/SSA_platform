"use server";

// AI correction of ONE hand-in ("Correggi questa consegna" on an Esiti row) —
// the per-row escape hatch when a submission has no draft (the submit-time
// background correction was lost, e.g. on a deploy) and the publication gate
// holds the outcome. Same engine and draft store as the batch and the
// submit-time path (correction-run.ts); here only the guard, mirroring
// manual-grade-actions.ts.

import { hasRole } from "@/lib/auth/guard";
import { anthropicConfig } from "@/lib/integrations/anthropic/client";
import { runSingleSubmissionCorrection } from "./correction-run";

export interface SingleCorrectionResult {
  ok: boolean;
  error?: string;
}

export async function runSubmissionCorrectionAction(input: {
  courseId: string;
  family: "nihonshu" | "shochu";
  testKey: string;
  submissionId: number;
}): Promise<SingleCorrectionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!/^(final|day[1-9])$/.test(input.testKey)) return { ok: false, error: "Test non valido." };
  if (input.family !== "nihonshu" && input.family !== "shochu") return { ok: false, error: "Famiglia esame non valida." };
  // Same posture as the batch: without the API key REFUSE, never silently
  // degrade to the offline heuristic stub.
  if (!anthropicConfig.isConfigured) return { ok: false, error: "AI non configurata." };
  try {
    const saved = await runSingleSubmissionCorrection(
      input.courseId,
      input.family,
      input.testKey,
      Number(input.submissionId),
    );
    return saved ? { ok: true } : { ok: false, error: "Consegna non trovata o bozza non salvata." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Correzione non riuscita." };
  }
}
