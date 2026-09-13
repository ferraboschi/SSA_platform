// Batch exam correction — CORE logic, shared by the "use server" action
// (correction-actions.ts, which adds the role guard) and integration tests.
// No auth here: the caller decides who may run it.

import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { anthropicConfig } from "@/lib/integrations/anthropic/client";
import { ClaudeGradingModel, ensureRagWired, gradeOpenAnswer, setGradingModel } from "@/lib/rag";
import type { GradeSuggestion } from "@/lib/rag/types";
import { loadCourseExamResults, type GradedSubmission } from "@/lib/exam-links/results";
import { loadPublicExam } from "@/lib/exam-links/load";
import {
  buildCorrectionDraft,
  manualGradesOf,
  manualOpenResult,
  type OpenAnswerResult,
  type QuestionMeta,
} from "./correction";
import {
  CORRECTION_KEY_PREFIX,
  correctionKey,
  correctionRunKey,
  type CorrectionDraft,
  type CorrectionRun,
} from "./correction-types";

/** Map one grader reply onto the draft's open-lane result. A REFUSAL (no
 *  on-topic knowledge, malformed model output) is not a grade: it goes to the
 *  manual-review lane exactly like a failed call — never a silent 0 that would
 *  deflate the score and slip past the openFailed publication gate. */
function openResultOf(sug: GradeSuggestion): OpenAnswerResult {
  if (sug.refused) {
    return {
      points: 0,
      confidence: 0,
      rationale: sug.rationale,
      grounded: false,
      citedTitles: [],
      failed: true,
    };
  }
  return {
    points: sug.suggestedPoints,
    vote: sug.vote,
    confidence: sug.confidence,
    rationale: sug.rationale,
    grounded: sug.citations.length > 0,
    citedTitles: sug.citations.map((c) => c.chunk.title),
    failed: false,
    provider: sug.provider,
  };
}

/** One failed grading call → 0-point failed grade routed to manual review. The
 *  REASON travels with it (truncated, no secrets): a provider 429 must be
 *  tellable apart from an empty knowledge base. */
function failedResultOf(e: unknown): OpenAnswerResult {
  const why = (e instanceof Error ? e.message : String(e)).slice(0, 160);
  return {
    points: 0,
    confidence: 0,
    rationale: `Valutazione automatica non riuscita (${why}): revisione manuale.`,
    grounded: false,
    citedTitles: [],
    failed: true,
  };
}

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

/** AI-grade ONE submission's open answers and persist its draft — the
 *  submit-time path (owner batch 8: day-test open answers are graded right
 *  after hand-in, in the background). Same engine, same draft store as the
 *  batch, so the student's esito and the staff's Esiti read the same data.
 *  Returns true when a draft was persisted. */
export async function runSingleSubmissionCorrection(
  courseId: string,
  family: "nihonshu" | "shochu",
  testKey: string,
  submissionId: number,
): Promise<boolean> {
  ensureRagWired();
  if (!anthropicConfig.isConfigured) return false;
  setGradingModel(new ClaudeGradingModel());

  const corsoId = Number(courseId);
  const results = await loadCourseExamResults(courseId, family);
  const sub = results.find((s) => s.id === submissionId && s.testKey === testKey);
  if (!sub) return false;

  const exam = await loadPublicExam(courseId, family, testKey as "final" | `day${number}`, true);
  const questionMeta = new Map<string, QuestionMeta>();
  for (const q of exam?.questions ?? []) {
    questionMeta.set(q.id, { points: q.points ?? 1, important: q.important ?? false });
  }

  // Rationale language (owner batch 19): the STUDENT's resoconto review page is
  // rendered for Italian and English only (JA is skipped), so grade an English
  // sitting in English (student reads it, staff can too) and everything else in
  // Italian — that keeps a JA sitting's rationale legible to the Italian
  // educator who audits the draft before confirming the official outcome.
  const gradeLang = sub.lang === "en" ? "en" : undefined;

  const svc = getSupabaseServiceClient();
  const at = new Date().toISOString();
  // An educator's manual votes already in the draft survive the re-run.
  const { data: prevRow } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", correctionKey(corsoId, sub.id))
    .maybeSingle();
  const manual = manualGradesOf(prevRow?.value as CorrectionDraft | null);
  const openResults = new Map<string, OpenAnswerResult>();
  for (const a of sub.answers) {
    // Grade with the AI EVERY answered question the objective grader could not
    // close (ok === null): open/fill without a key AND — the owner's rule "a
    // fine valutazione ogni domanda deve avere un esito" — a CHOICE question
    // whose answer key was left empty in the library (else it would sit "in
    // valutazione" forever, since it is neither auto-graded nor open).
    const gradableOpen = a.ok === null && a.given !== "" && a.given !== "—";
    if (!gradableOpen) continue;
    const kept = manual.get(a.qid);
    if (kept) {
      openResults.set(a.qid, kept);
      continue;
    }
    const maxPoints = questionMeta.get(a.qid)?.points ?? 1;
    try {
      // A fill routed to the AI (batch 21) carries its accepted answer in a.correct
      // — pass it as the reference so the model grades against the intended answer,
      // not KB retrieval alone. Open questions have a.correct === "—" → no rubric.
      const rubricKey = a.correct && a.correct !== "—" ? a.correct : undefined;
      const sug = await gradeOpenAnswer({ question: a.text, answer: a.given, maxPoints, kbSection: a.cat, lang: gradeLang, rubricKey });
      openResults.set(a.qid, openResultOf(sug));
    } catch (e) {
      openResults.set(a.qid, failedResultOf(e));
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
    .upsert(
      { key: correctionKey(corsoId, sub.id), value: { ...draft, rationaleLang: gradeLang ?? "it" } },
      { onConflict: "key" },
    );
  return !error;
}

/** Record an educator's MANUAL vote (1-5) for ONE open answer and rebuild the
 *  submission's draft around it — the fallback that keeps exams publishable
 *  when the AI cannot grade (provider outage, quota, refusal). Every other open
 *  answer keeps its stored grade (AI or manual, failed ones stay failed with
 *  their reason), so totals/verdict/openFailed are recomputed by the one pure
 *  builder and can never drift from the batch run. */
export async function applyManualOpenGrade(
  courseId: string,
  family: "nihonshu" | "shochu",
  testKey: string,
  submissionId: number,
  qid: string,
  vote: number,
): Promise<{ ok: boolean; error?: string; draft?: CorrectionDraft }> {
  if (!Number.isInteger(vote) || vote < 1 || vote > 5) return { ok: false, error: "Voto non valido (1-5)." };
  const corsoId = Number(courseId);
  const results = await loadCourseExamResults(courseId, family);
  const sub = results.find((s) => s.id === submissionId && s.testKey === testKey);
  if (!sub) return { ok: false, error: "Consegna non trovata." };
  const target = sub.answers.find((a) => a.qid === qid);
  // Only the open lane takes a manual vote: objective answers are already settled.
  if (!target || target.ok !== null || target.given === "" || target.given === "—") {
    return { ok: false, error: "Questa risposta non è in valutazione manuale." };
  }

  const exam = await loadPublicExam(courseId, family, testKey as "final" | `day${number}`, true);
  const questionMeta = new Map<string, QuestionMeta>();
  for (const q of exam?.questions ?? []) {
    questionMeta.set(q.id, { points: q.points ?? 1, important: q.important ?? false });
  }

  const svc = getSupabaseServiceClient();
  const key = correctionKey(corsoId, sub.id);
  const { data: row } = await svc.from("settings_kv").select("value").eq("key", key).maybeSingle();
  const prev = (row?.value as CorrectionDraft | null) ?? null;
  const rationaleLang = prev?.rationaleLang === "en" || sub.lang === "en" ? "en" : "it";

  const openResults = new Map<string, OpenAnswerResult>();
  for (const g of prev?.openGrades ?? []) {
    openResults.set(
      g.qid,
      g.failed
        ? { points: 0, confidence: 0, rationale: g.rationale, grounded: false, citedTitles: [], failed: true }
        : {
            points: g.points,
            vote: g.vote,
            confidence: g.confidence,
            rationale: g.rationale,
            grounded: g.grounded,
            citedTitles: g.citedTitles,
            failed: false,
            provider: g.provider ?? "model",
          },
    );
  }
  openResults.set(qid, manualOpenResult(questionMeta.get(qid)?.points ?? 1, vote, rationaleLang));

  const draft = buildCorrectionDraft({
    submission: { id: sub.id, studentName: sub.studentName, studentEmail: sub.studentEmail },
    answers: sub.answers,
    questionMeta,
    openResults,
    // Keep the AI run's timestamp: staleness is measured against the template
    // edit, and a manual vote re-grades nothing else.
    at: prev?.at ?? new Date().toISOString(),
  });
  const stored: CorrectionDraft = { ...draft, rationaleLang };
  const { error } = await svc.from("settings_kv").upsert({ key, value: stored }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: stored };
}

/** Run the batch correction for ONE of a course's tests (final exam or a
 *  day test — owner batch 7: the paid day tests get the same AI correction):
 *  AI-grade every open answer (grounded in the KB, constrained to the
 *  question's category section), build one CorrectionDraft per student and
 *  persist drafts + run summary to settings_kv. A single failed grading call
 *  never aborts the run — that answer is marked failed (0 points, manual
 *  review) and the run moves on. */
export async function runCourseCorrection(
  courseId: string,
  family: "nihonshu" | "shochu",
  testKey: "final" | `day${number}` = "final",
): Promise<CorrectionRun> {
  // Wire the grading backend ONCE for the whole run (same seam as
  // gradeOpenAnswerAction): RAG retrieval + the live Claude grader. Without an
  // API key the heuristic stub stays wired so the run remains testable
  // offline — each draft then reports aiProvider "stub".
  ensureRagWired();
  if (anthropicConfig.isConfigured) setGradingModel(new ClaudeGradingModel());

  const corsoId = Number(courseId);
  const results = await loadCourseExamResults(courseId, family);
  const finals = dedupePerStudent(results.filter((s) => s.testKey === testKey));

  // Template meta (points/importance) for this test, keyed by question id.
  const exam = await loadPublicExam(courseId, family, testKey, true);
  const questionMeta = new Map<string, QuestionMeta>();
  for (const q of exam?.questions ?? []) {
    questionMeta.set(q.id, { points: q.points ?? 1, important: q.important ?? false });
  }

  const svc = getSupabaseServiceClient();
  const at = new Date().toISOString();
  const run: CorrectionRun = { at, testKey, total: finals.length, graded: 0, failures: [] };

  // Manual votes already stored in this course's drafts, per submission: an
  // educator's decision survives every re-run (only the AI grades are redone).
  const manualBySub = new Map<number, ReturnType<typeof manualGradesOf>>();
  {
    const { data: prev } = await svc
      .from("settings_kv")
      .select("key, value")
      .like("key", `${CORRECTION_KEY_PREFIX}${corsoId}:%`);
    for (const r of (prev ?? []) as { key: string; value: CorrectionDraft | null }[]) {
      const subId = Number(r.key.slice(r.key.lastIndexOf(":") + 1));
      if (Number.isInteger(subId) && r.value) manualBySub.set(subId, manualGradesOf(r.value));
    }
  }

  // SEQUENTIAL on purpose: one grading call at a time keeps the run inside the
  // provider's rate limits and makes failures attributable per answer.
  for (const sub of finals) {
    try {
      // Same rule as the submit-time path: English sitting → English rationale,
      // everything else → Italian (see runSingleSubmissionCorrection).
      const gradeLang = sub.lang === "en" ? "en" : undefined;
      const manual = manualBySub.get(sub.id);
      const openResults = new Map<string, OpenAnswerResult>();
      for (const a of sub.answers) {
        // EVERY answered question the objective grader could not close
        // (ok === null) goes to the AI — open/fill without a key AND a choice
        // question whose key was left empty in the library — so nothing is
        // ever left "in valutazione". Blank ("—") answers are already 0.
        const gradableOpen = a.ok === null && a.given !== "" && a.given !== "—";
        if (!gradableOpen) continue;
        const kept = manual?.get(a.qid);
        if (kept) {
          openResults.set(a.qid, kept);
          continue;
        }
        const maxPoints = questionMeta.get(a.qid)?.points ?? 1;
        try {
          const sug = await gradeOpenAnswer({
            question: a.text,
            answer: a.given,
            maxPoints,
            kbSection: a.cat,
            lang: gradeLang,
            // Fill reference answer (batch 21); open questions pass "—" → no rubric.
            rubricKey: a.correct && a.correct !== "—" ? a.correct : undefined,
          });
          openResults.set(a.qid, openResultOf(sug));
        } catch (e) {
          // One failed model call must never abort the run: the answer gets a
          // 0-point failed grade and the draft routes it to manual review.
          openResults.set(a.qid, failedResultOf(e));
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
        .upsert(
          { key: correctionKey(corsoId, sub.id), value: { ...draft, rationaleLang: gradeLang ?? "it" } },
          { onConflict: "key" },
        );
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
      .upsert({ key: correctionRunKey(corsoId, testKey), value: run }, { onConflict: "key" });
  } catch {
    /* fail soft */
  }
  return run;
}
