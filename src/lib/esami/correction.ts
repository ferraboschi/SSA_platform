// Pure batch-correction builder for the "Correggi" run — no IO, no server deps,
// fully unit-testable (correction.test.ts). The engine (correction-actions.ts)
// feeds it one submission's graded answers, the exam template's per-question
// meta (points/importance) and the AI grading results for the open answers; it
// returns the persistable CorrectionDraft. The draft is ADVISORY — staff still
// confirms the official verdict in the Esiti tab.

import { EXAM_THRESHOLDS } from "@/lib/domain/constants";
import type { ExamOutcome } from "@/lib/exam-links/grading";
import type { CorrectionDraft, OpenGrade, WrongAnswer } from "./correction-types";

/** One graded answer as loadCourseExamResults produces it (GradedAnswer + cat). */
export interface CorrectionAnswer {
  qid: string;
  type: string;
  text: string;
  given: string;
  correct: string;
  /** null = not auto-graded (open, fill without a usable key, match, order). */
  ok: boolean | null;
  /** Question category (KB-section key) — used upstream to scope AI retrieval. */
  cat?: string;
}

/** Template metadata for one question (from loadPublicExam's final questions). */
export interface QuestionMeta {
  points: number;
  important: boolean;
}

/** Result of one AI grading call for an open answer, keyed by qid. */
export interface OpenAnswerResult {
  points: number;
  /** AI vote 1-5 when the model produced one. */
  vote?: number;
  confidence: number;
  rationale: string;
  grounded: boolean;
  citedTitles: string[];
  /** True when the grading call failed → 0 points, manual review required. */
  failed: boolean;
  /** Backend that produced the points; omit when failed (nothing was graded). */
  provider?: "model" | "stub";
}

export interface CorrectionDraftInput {
  submission: { id: number; studentName: string; studentEmail: string };
  answers: CorrectionAnswer[];
  questionMeta: Map<string, QuestionMeta>;
  openResults: Map<string, OpenAnswerResult>;
  /** ISO timestamp of the run — stamped on every draft it produces. */
  at: string;
}

/** Unknown qid (template edited between submit and run) → neutral weight. */
const DEFAULT_META: QuestionMeta = { points: 1, important: false };

/** Rationale for an open answer that never got a grading result (blank answer,
 *  or the engine skipped the call): scored 0 and routed to manual review. */
const MISSING_GRADE_RATIONALE =
  "Nessuna valutazione automatica disponibile: revisione manuale.";

/** Two decimals — AI points can be fractional (the stub grades in tenths) and
 *  persisted totals must not carry float noise into the JSON. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** True when the answer belongs to the AI-graded open lane: open/fill questions
 *  the objective grader routed to manual review. match/order also grade to
 *  ok===null but are NOT AI-gradable → they stay outside both point pools. */
function isOpenLane(a: CorrectionAnswer): boolean {
  return a.ok === null && (a.type === "open" || a.type === "fill");
}

/** Draft verdict from a combined percentage. Rounds to the NEAREST INTEGER
 *  first, then compares to the SSA thresholds (79.5 → 80 → promosso, while
 *  79.4 → 79 → rimandato). Thresholds come from EXAM_THRESHOLDS, never literals. */
export function verdictFromPct(pct: number): ExamOutcome {
  const rounded = Math.round(pct);
  if (rounded >= EXAM_THRESHOLDS.pass * 100) return "passed";
  if (rounded >= EXAM_THRESHOLDS.retrial * 100) return "retrial";
  return "failed";
}

export function buildCorrectionDraft(input: CorrectionDraftInput): CorrectionDraft {
  const { submission, answers, questionMeta, openResults, at } = input;
  const metaOf = (qid: string): QuestionMeta => questionMeta.get(qid) ?? DEFAULT_META;

  // OBJECTIVE lane: points earned on auto-graded questions. Wrong answers
  // surface in the report — important questions first, then the heaviest.
  let objectiveEarned = 0;
  let objectiveMax = 0;
  let gradableCount = 0;
  let correctCount = 0;
  const wrongAnswers: WrongAnswer[] = [];
  for (const a of answers) {
    if (a.ok === null) continue;
    const m = metaOf(a.qid);
    objectiveMax += m.points;
    gradableCount++;
    if (a.ok) {
      objectiveEarned += m.points;
      correctCount++;
    } else {
      wrongAnswers.push({
        qid: a.qid,
        question: a.text.trim(),
        given: a.given,
        correct: a.correct,
        important: m.important,
        points: m.points,
      });
    }
  }
  wrongAnswers.sort((x, y) => Number(y.important) - Number(x.important) || y.points - x.points);

  // OPEN lane: AI points per open/fill answer. A missing result (blank answer
  // or a skipped call) still yields a row — failed, 0 points — so the report
  // always lists every open question and routes the gaps to manual review.
  let openEarned = 0;
  let openMax = 0;
  let openFailed = 0;
  let sawModel = false;
  let sawStub = false;
  const openGrades: OpenGrade[] = [];
  for (const a of answers) {
    if (!isOpenLane(a)) continue;
    const m = metaOf(a.qid);
    openMax += m.points;
    const r = openResults.get(a.qid);
    if (!r) {
      openFailed++;
      openGrades.push({
        qid: a.qid,
        question: a.text.trim(),
        given: a.given,
        points: 0,
        maxPoints: m.points,
        confidence: 0,
        rationale: MISSING_GRADE_RATIONALE,
        grounded: false,
        citedTitles: [],
        failed: true,
      });
      continue;
    }
    // Clamp into [0, maxPoints]: a backend glitch must never inflate the total.
    const points = r.failed ? 0 : Math.max(0, Math.min(m.points, r.points));
    openEarned += points;
    if (r.failed) openFailed++;
    else if (r.provider === "model") sawModel = true;
    else if (r.provider === "stub") sawStub = true;
    openGrades.push({
      ...(r.vote != null && !r.failed ? { vote: r.vote } : {}),
      qid: a.qid,
      question: a.text.trim(),
      given: a.given,
      points,
      maxPoints: m.points,
      confidence: r.failed ? 0 : r.confidence,
      rationale: r.rationale,
      grounded: r.grounded,
      citedTitles: r.citedTitles,
      failed: r.failed,
    });
  }

  const max = objectiveMax + openMax;
  // Round THEN compare: verdictFromPct sees the same integer the draft stores.
  const combinedPct = max > 0 ? Math.round((100 * (objectiveEarned + openEarned)) / max) : 0;
  // Count-based like the live auto-corrector (GradedSubmission.autoScore), so
  // the draft's objective figure matches the Esiti tab for the same submission.
  const objectivePct = gradableCount > 0 ? Math.round((100 * correctCount) / gradableCount) : 0;

  return {
    at,
    submissionId: submission.id,
    studentName: submission.studentName,
    studentEmail: submission.studentEmail,
    combinedPct,
    objectivePct,
    verdict: verdictFromPct(combinedPct),
    aiProvider: sawModel ? "model" : sawStub ? "stub" : "none",
    openGrades,
    wrongAnswers,
    totals: {
      earned: round2(objectiveEarned + openEarned),
      max,
      objectiveEarned: round2(objectiveEarned),
      objectiveMax,
      openEarned: round2(openEarned),
      openMax,
      openFailed,
    },
  };
}
