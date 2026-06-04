import "server-only";

// Real feedback aggregation for staff (NOT a per-student PDF). Reads the actual
// feedback submissions for a course and computes, per question: rating mean +
// 1–5 distribution, choice option distribution, and collected open responses.
// The public runner stores choice answers as option TEXT and ratings as a
// numeric string, so we match by text / parse numbers accordingly.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadPublicExam, type PublicRunnerQuestion } from "./load";

export type FeedbackQuestionKind = "rating" | "choice" | "open";

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

export async function loadCourseFeedbackResults(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<FeedbackAggregateResult> {
  const svc = getSupabaseServiceClient();
  const { data: subs } = await svc
    .from("exam_submissions")
    .select("id, answers, created_at")
    .eq("corso_id", Number(courseId))
    .eq("mode", "exam")
    .eq("test_key", "feedback")
    .order("created_at", { ascending: false });

  const exam = await loadPublicExam(courseId, family, "feedback", true);
  const questions: PublicRunnerQuestion[] = exam?.questions ?? [];
  const rows = (subs ?? []) as Array<{ id: number; answers: Record<string, string | string[]> | null }>;

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
