// Pure feedback aggregation — no DB, no `server-only`, fully unit-testable.
// loadCourseFeedbackResults reads the submissions then hands them here to compute
// per-question: rating mean + 1–5 distribution, choice option distribution, and
// collected open responses. The public runner stores choice answers as option
// TEXT and ratings as a numeric string, so we match by text / parse numbers.

export type FeedbackQuestionKind = "rating" | "choice" | "open";

/** Minimal question shape the aggregator needs (subset of PublicRunnerQuestion). */
export interface FeedbackQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
}

export interface FeedbackQuestionAgg {
  qid: string;
  text: string;
  kind: FeedbackQuestionKind;
  answered: number;
  /** rating */
  ratingAvg: number | null;
  ratingBuckets: number[]; // index 0..4 → 1..5 stars
  /** choice */
  optionLabels: string[];
  optionCounts: number[];
  /** open */
  openResponses: string[];
}

export interface FeedbackAggregateResult {
  responses: number;
  questions: FeedbackQuestionAgg[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function aggregateFeedback(
  questions: FeedbackQuestion[],
  rows: Array<{ answers: Record<string, string | string[]> | null }>,
): FeedbackAggregateResult {
  const out: FeedbackQuestionAgg[] = questions.map((q) => {
    const isChoice = q.options.length > 0 && q.type !== "rating";
    const isRating = q.type === "rating";
    const kind: FeedbackQuestionKind = isRating ? "rating" : isChoice ? "choice" : "open";

    const buckets = [0, 0, 0, 0, 0];
    const optionCounts = q.options.map(() => 0);
    const openResponses: string[] = [];
    let answered = 0;
    let ratingSum = 0;
    let ratingN = 0;

    for (const s of rows) {
      const given = s.answers?.[q.id];
      if (given == null || (Array.isArray(given) && given.length === 0) || given === "") continue;

      if (isRating) {
        const n = Number(Array.isArray(given) ? given[0] : given);
        // Only count it as answered when it's a valid 1–5 rating, so the shown
        // response count matches the average's denominator.
        if (Number.isFinite(n) && n >= 1 && n <= 5) {
          answered++;
          buckets[Math.round(n) - 1]++;
          ratingSum += n;
          ratingN++;
        }
      } else if (isChoice) {
        answered++;
        const vals = (Array.isArray(given) ? given : [given]).map((v) => norm(String(v)));
        q.options.forEach((opt, i) => {
          if (vals.includes(norm(opt))) optionCounts[i]++;
        });
      } else {
        const text = String(Array.isArray(given) ? given.join(", ") : given).trim();
        if (text) {
          answered++;
          openResponses.push(text);
        }
      }
    }

    return {
      qid: q.id,
      text: q.text,
      kind,
      answered,
      ratingAvg: ratingN ? Math.round((ratingSum / ratingN) * 10) / 10 : null,
      ratingBuckets: buckets,
      optionLabels: q.options,
      optionCounts,
      openResponses,
    };
  });

  return { responses: rows.length, questions: out };
}
