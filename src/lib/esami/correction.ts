// Pure batch-correction builder for the "Correggi" run — no IO, no server deps,
// fully unit-testable (correction.test.ts). The engine (correction-actions.ts)
// feeds it one submission's graded answers, the exam template's per-question
// meta (points/importance) and the AI grading results for the open answers; it
// returns the persistable CorrectionDraft. The draft is ADVISORY — staff still
// confirms the official verdict in the Esiti tab.

import { scoreToOutcome, type ExamOutcome } from "@/lib/exam-links/grading";
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
  /** Earned share 0..1 from the objective grader (MULTI partial credit). */
  fraction?: number;
  /** Blank answer — scored zero at full weight, shown as "Non risposto". */
  unanswered?: boolean;
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

/** True when the answer belongs to the AI-graded open lane. `ok === null` means
 *  the objective grader could NOT close it — open/fill without a usable key,
 *  match/order, AND a choice question whose answer key was left empty in the
 *  library (owner batch 15: it must still be scored, not ignored). Blank
 *  answers never reach here (they resolve to ok=false in the objective lane),
 *  so `ok === null` is exactly "answered but objectively ungradeable" → the AI
 *  grades it and its points count toward the total. Must stay in lock-step with
 *  the grading predicate in correction-run.ts. */
function isOpenLane(a: CorrectionAnswer): boolean {
  return a.ok === null;
}

/** Draft verdict from a combined percentage — the ONE score→outcome rule lives
 *  in scoreToOutcome (rounds to nearest int, then compares to EXAM_THRESHOLDS:
 *  79.5 → 80 → promosso, 79.4 → 79 → rimandato). Kept as a named alias so the
 *  correction code reads in its own vocabulary. */
export function verdictFromPct(pct: number): ExamOutcome {
  return scoreToOutcome(pct);
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
  // Per-category X / Y count of OBJECTIVE answers (owner debug call: the bozza
  // shows "Storia 5/20" instead of a long list of individual questions).
  const catCounts = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    if (a.ok === null) continue;
    const m = metaOf(a.qid);
    objectiveMax += m.points;
    gradableCount++;
    const cat = (a.cat ?? "").trim() || "Generale";
    const cc = catCounts.get(cat) ?? { correct: 0, total: 0 };
    cc.total++;
    if (a.ok) cc.correct++;
    catCounts.set(cat, cc);
    // MULTI partial credit rides in via `fraction` (owner batch 10): a fully
    // right answer earns the point, a partially right one its share.
    const frac = a.ok ? 1 : Math.max(0, Math.min(1, a.fraction ?? 0));
    objectiveEarned += frac * m.points;
    if (a.ok) {
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
    categoryCounts: [...catCounts.entries()].map(([name, c]) => ({
      name,
      correct: c.correct,
      total: c.total,
    })),
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
