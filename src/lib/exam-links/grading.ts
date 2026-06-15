// Pure exam-correction logic — no DB, no `server-only`, fully unit-testable.
// loadCourseExamResults (and the client preview) feed it questions + the
// student's stored answers and get back the graded breakdown + auto score.

import { EXAM_THRESHOLDS } from "@/lib/domain/constants";

export type ExamOutcome = "passed" | "retrial" | "failed";

/** Minimal question shape the grader needs (a subset of PublicRunnerQuestion). */
export interface GradableQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Option INDICES for choice questions, accepted STRINGS for "fill". */
  correct?: Array<number | string>;
}

export interface GradedAnswer {
  qid: string;
  type: string;
  text: string;
  given: string;
  correct: string;
  ok: boolean | null; // null = manual review (open/match/order, or fill w/o key)
}

export interface GradeResult {
  detail: GradedAnswer[];
  gradable: number; // count of auto-graded questions
  correct: number;
  manual: number; // count needing manual review
  autoScore: number; // 0–100 over the gradable questions
  suggested: ExamOutcome;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
const normStr = (s: unknown) => String(s ?? "").trim().toLowerCase();
const asArray = (given: string | string[] | undefined): string[] =>
  given == null ? [] : Array.isArray(given) ? given : [given];

/** Auto-gradable choice types. Open / match / order go to manual review. */
export const isObjective = (t: string): boolean =>
  t === "single" || t === "multi" || t === "truefalse" || t === "image";

/** Grade a choice question. The runner stores the selected option TEXT, so we
 *  compare the given TEXTS to the correct option texts; we also accept index
 *  storage (legacy answers) by comparing against the raw indices. */
export function gradeObjective(given: string | string[] | undefined, q: GradableQuestion): boolean {
  const correctIdx = q.correct ?? [];
  const givenSet = new Set(asArray(given).map(normStr).filter(Boolean));
  const correctTextSet = new Set(correctIdx.map((i) => normStr(q.options[Number(i)])).filter(Boolean));
  const correctIdxSet = new Set(correctIdx.map((i) => normStr(i)));
  return (
    (correctTextSet.size > 0 && setsEqual(givenSet, correctTextSet)) ||
    setsEqual(givenSet, correctIdxSet)
  );
}

/** Human-readable rendering of a given answer (maps legacy indices → text). */
export function fmtGiven(given: string | string[] | undefined, q: GradableQuestion): string {
  if (given == null || (Array.isArray(given) && given.length === 0)) return "—";
  const arr = asArray(given);
  if (q.options.length) {
    const labels = arr.map((v) => {
      const n = Number(v);
      return Number.isInteger(n) && q.options[n] != null ? q.options[n] : v;
    });
    return labels.join(", ");
  }
  return arr.join(", ");
}

/** Map an auto score (0–100) to the suggested outcome via the SSA thresholds. */
export function scoreToOutcome(autoScore: number): ExamOutcome {
  return autoScore >= EXAM_THRESHOLDS.pass * 100
    ? "passed"
    : autoScore >= EXAM_THRESHOLDS.retrial * 100
      ? "retrial"
      : "failed";
}

/** The objective percentage to CERTIFY alongside a (possibly manual) outcome —
 *  or `null` when no number should be stored/shown:
 *   • `gradable === 0` → no auto-gradable questions: the outcome is a fully manual
 *     decision and there is no objective score (avoids a meaningless "0%").
 *   • the chosen `outcome` ≠ what the auto-score implies (operator override) → the
 *     objective % would contradict the decision (avoids e.g. "Bocciato 85%").
 *  Persisted into `exam_score_pct`; every consumer renders "%" only when non-null. */
export function certifiedScore(
  gradable: number,
  autoScore: number,
  outcome: ExamOutcome,
): number | null {
  if (gradable <= 0) return null;
  if (scoreToOutcome(autoScore) !== outcome) return null;
  return autoScore;
}

/** Grade a whole submission: per-question breakdown + auto score + suggestion. */
export function gradeAnswers(
  questions: GradableQuestion[],
  answers: Record<string, string | string[]> | null | undefined,
): GradeResult {
  const ans = answers ?? {};
  let gradable = 0;
  let correct = 0;
  let manual = 0;

  const detail: GradedAnswer[] = questions.map((q) => {
    const given = ans[q.id];

    // FILL ("Riempi spazio"): the typed answer is matched, case-insensitive,
    // against the accepted strings (q.correct). Deterministic → auto-graded.
    // With no accepted answers it falls back to manual review.
    if (q.type === "fill") {
      const accepted = (q.correct ?? []).map((c) => normStr(c)).filter(Boolean);
      if (accepted.length === 0) {
        manual++;
        return { qid: q.id, type: q.type, text: q.text, given: fmtGiven(given, q), correct: "—", ok: null };
      }
      gradable++;
      const givenNorm = normStr(Array.isArray(given) ? given[0] : given);
      const ok = givenNorm !== "" && accepted.includes(givenNorm);
      if (ok) correct++;
      return {
        qid: q.id,
        type: q.type,
        text: q.text,
        given: fmtGiven(given, q),
        correct: (q.correct ?? []).map(String).join(", "),
        ok,
      };
    }

    // Open / match / order (or a choice question with no answer key) → manual.
    if (!isObjective(q.type) || !q.correct) {
      manual++;
      return { qid: q.id, type: q.type, text: q.text, given: fmtGiven(given, q), correct: "—", ok: null };
    }

    // Objective choice question → auto-graded.
    gradable++;
    const ok = gradeObjective(given, q);
    if (ok) correct++;
    return {
      qid: q.id,
      type: q.type,
      text: q.text,
      given: fmtGiven(given, q),
      correct: q.correct.map((i) => q.options[Number(i)]).filter(Boolean).join(", "),
      ok,
    };
  });

  const autoScore = gradable ? Math.round((correct / gradable) * 100) : 0;
  return { detail, gradable, correct, manual, autoScore, suggested: scoreToOutcome(autoScore) };
}
