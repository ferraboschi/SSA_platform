import { notFound } from "next/navigation";
import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { examEmailConfig } from "@/lib/integrations/config";
import { loadCourseExamResults } from "@/lib/exam-links/results";
import { loadCourseFeedbackResults } from "@/lib/exam-links/feedback-results";
import { ExamResultsClient } from "@/components/esami/ExamResultsClient";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireNavAccess("esami");
  const { id } = await params;
  const ds = await getDataSource();
  const course = /^\d+$/.test(id)
    ? await ds.courses.getById(id)
    : await ds.courses.getByHandle(id);
  if (!course) notFound();

  const family: "nihonshu" | "shochu" | null =
    course.type === "certificato" ? "nihonshu" : course.type === "shochu" ? "shochu" : null;
  const [results, feedback, session] = family
    ? await Promise.all([
        loadCourseExamResults(course.id, family),
        loadCourseFeedbackResults(course.id, family),
        getSession(),
      ])
    : [[], null, await getSession()];

  return (
    <ExamResultsClient
      courseId={course.id}
      courseTitle={course.shortTitle}
      hasExam={!!family}
      family={family}
      results={results}
      feedback={feedback}
      adminEmail={session?.user?.email ?? ""}
      emailsLive={examEmailConfig.live}
    />
  );
}
