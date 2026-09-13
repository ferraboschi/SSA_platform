// Pure feedback aggregation — no DB, no `server-only`, fully unit-testable.
// loadCourseFeedbackResults reads the submissions then hands them here to compute
// per-question: rating mean + 1–5 distribution, choice option distribution, and
// collected open responses. The public runner stores choice answers as the
// option TEXT the student SAW (translated on an EN/JA sitting) and ratings as
// a numeric string, so we resolve texts to option indices / parse numbers.

export type FeedbackQuestionKind = "rating" | "choice" | "open";

/** Minimal question shape the aggregator needs (subset of PublicRunnerQuestion). */
export interface FeedbackQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Thematic area ("Storia", "Servizio", …) — groups rating questions into the
   *  per-area satisfaction histogram. Blank → "Generale". */
  cat?: string;
  /** Stored EN/JA translations, index-aligned with `options` — what the runner
   *  showed (and stored) on a sitting in that language. */
  i18n?: Partial<Record<"en" | "ja", { text: string; options: string[] }>>;
}

/** One feedback submission: its answers + the language it was filled in. */
export interface FeedbackRow {
  answers: Record<string, string | string[]> | null;
  /** "it" | "en" | "ja"; null/absent = Italian. */
  lang?: string | null;
}

/** The options the student actually SAW — the sitting language's translation
 *  when present, else the Italian original (the runner's localizeQ fallback). */
function seenOptions(q: FeedbackQuestion, lang: string | null | undefined): string[] {
  if (lang === "en" || lang === "ja") {
    const tr = q.i18n?.[lang]?.options;
    if (tr?.length) return tr;
  }
  return q.options;
}

/** Satisfaction rolled up per THEMATIC AREA (owner/educator): the mean of every
 *  rating answer to the area's questions, plus its 1–5 distribution. */
export interface FeedbackAreaAgg {
  name: string;
  ratingAvg: number | null;
  answered: number;
  ratingBuckets: number[]; // 0..4 → 1..5
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
  /** Per-area satisfaction (rating questions only) — the histogram source. Empty
   *  when the feedback carries no rating questions. */
  areas: FeedbackAreaAgg[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function aggregateFeedback(
  questions: FeedbackQuestion[],
  rows: FeedbackRow[],
): FeedbackAggregateResult {
  // Per-area accumulators (rating answers only), keyed by the question's area.
  const areaAcc = new Map<string, { sum: number; n: number; buckets: number[] }>();
  const areaOrder: string[] = [];

  const out: FeedbackQuestionAgg[] = questions.map((q) => {
    const isChoice = q.options.length > 0 && q.type !== "rating";
    const isRating = q.type === "rating";
    const kind: FeedbackQuestionKind = isRating ? "rating" : isChoice ? "choice" : "open";
    const area = (q.cat ?? "").trim() || "Generale";
    if (isRating && !areaAcc.has(area)) {
      areaAcc.set(area, { sum: 0, n: 0, buckets: [0, 0, 0, 0, 0] });
      areaOrder.push(area);
    }

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
          const a = areaAcc.get(area)!;
          a.sum += n;
          a.n++;
          a.buckets[Math.round(n) - 1]++;
        }
      } else if (isChoice) {
        answered++;
        // Resolve each pick to an option INDEX (the translation the student saw
        // first, then the Italian original) and count by index — an EN/JA pick
        // lands on the same bar as its Italian twin instead of vanishing.
        const seen = seenOptions(q, s.lang);
        const vals = new Set((Array.isArray(given) ? given : [given]).map((v) => norm(String(v))));
        for (const v of vals) {
          let i = seen.findIndex((opt) => norm(opt) === v);
          if (i < 0) i = q.options.findIndex((opt) => norm(opt) === v);
          if (i >= 0) optionCounts[i]++;
        }
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

  const areas: FeedbackAreaAgg[] = areaOrder.map((name) => {
    const a = areaAcc.get(name)!;
    return {
      name,
      ratingAvg: a.n ? Math.round((a.sum / a.n) * 10) / 10 : null,
      answered: a.n,
      ratingBuckets: a.buckets,
    };
  });

  return { responses: rows.length, questions: out, areas };
}
