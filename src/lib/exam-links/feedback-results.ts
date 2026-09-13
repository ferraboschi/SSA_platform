import "server-only";

// Real feedback aggregation for staff (NOT a per-student PDF). Reads the actual
// feedback submissions for a course; the per-question aggregation itself is the
// pure, unit-tested aggregateFeedback() in ./feedback-agg.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadPublicExam } from "./load";
import { aggregateFeedback, type FeedbackAggregateResult, type FeedbackRow } from "./feedback-agg";

// Re-exported so existing importers keep `from "@/lib/exam-links/feedback-results"`.
export type { FeedbackAggregateResult, FeedbackQuestionAgg, FeedbackQuestionKind } from "./feedback-agg";

export async function loadCourseFeedbackResults(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<FeedbackAggregateResult> {
  const svc = getSupabaseServiceClient();
  // `lang` travels with each row: choice answers are stored as the option text
  // the student SAW, so the aggregator needs the sitting language to map them.
  const { data: subs } = await svc
    .from("exam_submissions")
    .select("id, answers, lang, created_at")
    .eq("corso_id", Number(courseId))
    .eq("mode", "exam")
    .eq("test_key", "feedback")
    .order("created_at", { ascending: false });

  const exam = await loadPublicExam(courseId, family, "feedback", true);
  const rows = (subs ?? []) as FeedbackRow[];
  return aggregateFeedback(exam?.questions ?? [], rows);
}
