// Batch exam correction — CORE logic, shared by the "use server" action
// (correction-actions.ts, which adds the role guard) and integration tests.
// No auth here: the caller decides who may run it.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { anthropicConfig } from "@/lib/integrations/anthropic/client";
import { ClaudeGradingModel, ensureRagWired, gradeOpenAnswer, setGradingModel } from "@/lib/rag";
import { loadCourseExamResults, type GradedSubmission } from "@/lib/exam-links/results";
import { loadPublicExam } from "@/lib/exam-links/load";
import { buildCorrectionDraft, type OpenAnswerResult, type QuestionMeta } from "./correction";
import {
  correctionKey,
  correctionRunKey,
  type CorrectionRun,
} from "./correction-types";

/** Dedupe final submissions per student: the NEWEST submission wins (a retake
 *  supersedes). Identity is the email+name PAIR — a "doppio" companion can share
 *  the buyer's email but has their own name (see results.ts's identity rules),
 *  so the email alone would merge two different people. Fully anonymous rows
 *  keep their submission id so distinct unknowns never collapse together. */
export function dedupePerStudent(subs: GradedSubmission[]): GradedSubmission[] {
  const byStudent = new Map<string, GradedSubmission>();
  for (const s of subs) {
    const email = s.studentEmail.trim().toLowerCase();
    const name = s.studentName.trim().toLowerCase();
    const anonymous = email === "" && (name === "" || name === "—");
    const key = anonymous ? `sub:${s.id}` : `${email}|${name}`;
    const prev = byStudent.get(key);
    if (!prev || Date.parse(s.submittedAt) > Date.parse(prev.submittedAt)) byStudent.set(key, s);
  }
  return [...byStudent.values()];
}

/** Run the batch correction for a course's FINAL exam: AI-grade every open
 *  answer (grounded in the KB, constrained to the question's category section),
 *  build one CorrectionDraft per student and persist drafts + run summary to
 *  settings_kv. A single failed grading call never aborts the run — that answer
 *  is marked failed (0 points, manual review) and the run moves on. */
export async function runCourseCorrection(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<CorrectionRun> {
  // Wire the grading backend ONCE for the whole run (same seam as
  // gradeOpenAnswerAction): RAG retrieval + the live Claude grader. Without an
  // API key the heuristic stub stays wired so the run remains testable
  // offline — each draft then reports aiProvider "stub".
  ensureRagWired();
  if (anthropicConfig.isConfigured) setGradingModel(new ClaudeGradingModel());

  const corsoId = Number(courseId);
  const results = await loadCourseExamResults(courseId, family);
  const finals = dedupePerStudent(results.filter((s) => s.testKey === "final"));

  // Template meta (points/importance) for the final test, keyed by question id.
  const exam = await loadPublicExam(courseId, family, "final", true);
  const questionMeta = new Map<string, QuestionMeta>();
  for (const q of exam?.questions ?? []) {
    questionMeta.set(q.id, { points: q.points ?? 1, important: q.important ?? false });
  }

  const svc = getSupabaseServiceClient();
  const at = new Date().toISOString();
  const run: CorrectionRun = { at, total: finals.length, graded: 0, failures: [] };

  // SEQUENTIAL on purpose: one grading call at a time keeps the run inside the
  // provider's rate limits and makes failures attributable per answer.
  for (const sub of finals) {
    try {
      const openResults = new Map<string, OpenAnswerResult>();
      for (const a of sub.answers) {
        // Only open/fill answers the objective grader could not auto-grade,
        // and only when the student actually wrote something ("—" = blank).
        const gradableOpen =
          a.ok === null &&
          (a.type === "open" || a.type === "fill") &&
          a.given !== "" &&
          a.given !== "—";
        if (!gradableOpen) continue;
        const maxPoints = questionMeta.get(a.qid)?.points ?? 1;
        try {
          const sug = await gradeOpenAnswer({
            question: a.text,
            answer: a.given,
            maxPoints,
            kbSection: a.cat,
          });
          openResults.set(a.qid, {
            points: sug.suggestedPoints,
            confidence: sug.confidence,
            rationale: sug.rationale,
            grounded: sug.citations.length > 0,
            citedTitles: sug.citations.map((c) => c.chunk.title),
            failed: false,
            provider: sug.provider,
          });
        } catch {
          // One failed model call must never abort the run: the answer gets a
          // 0-point failed grade and the draft routes it to manual review.
          openResults.set(a.qid, {
            points: 0,
            confidence: 0,
            rationale: "Valutazione automatica non riuscita: revisione manuale.",
            grounded: false,
            citedTitles: [],
            failed: true,
          });
        }
      }

      const draft = buildCorrectionDraft({
        submission: { id: sub.id, studentName: sub.studentName, studentEmail: sub.studentEmail },
        answers: sub.answers,
        questionMeta,
        openResults,
        at,
      });
      const { error } = await svc
        .from("settings_kv")
        .upsert({ key: correctionKey(corsoId, sub.id), value: draft }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      run.graded++;
    } catch (e) {
      run.failures.push({
        submissionId: sub.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // The run summary is advisory — the drafts are already persisted, so a
  // failed stamp must not fail a completed run (fails soft like send-log).
  try {
    await svc
      .from("settings_kv")
      .upsert({ key: correctionRunKey(corsoId), value: run }, { onConflict: "key" });
  } catch {
    /* fail soft */
  }
  return run;
}
