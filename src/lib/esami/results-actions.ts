"use server";

import { assertRole } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { examEmailConfig } from "@/lib/integrations/config";
import { loadCourseExamResults, type GradedSubmission } from "@/lib/exam-links/results";
import { loadCourseFeedbackResults, type FeedbackAggregateResult } from "@/lib/exam-links/feedback-results";

export interface CourseExamResultsData {
  results: GradedSubmission[];
  feedback: FeedbackAggregateResult | null;
  adminEmail: string;
  /** Whether result emails go to students (go-live) or route to staff (test). */
  emailsLive: boolean;
}

/** Loads the grading data for a course's exam (for the in-tab Esiti view). */
export async function getCourseExamResultsAction(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<CourseExamResultsData> {
  await assertRole(["admin", "manager"]);
  const [results, feedback, session] = await Promise.all([
    loadCourseExamResults(courseId, family),
    loadCourseFeedbackResults(courseId, family),
    getSession(),
  ]);
  return { results, feedback, adminEmail: session?.user?.email ?? "", emailsLive: examEmailConfig.live };
}
