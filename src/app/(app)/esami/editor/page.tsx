import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import type { ExamFamily, ExamTemplate } from "@/lib/domain";
import { ExamLibraryEditor } from "@/components/esami/ExamLibraryEditor";
import { loadAllExamEmailTemplates } from "@/lib/esami/exam-email-store";
import { getUpcomingCourseLines } from "@/lib/esami/upcoming-courses";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireNavAccess("esami");
  const [ds, session] = await Promise.all([getDataSource(), getSession()]);
  const [list, courses, emailTemplates] = await Promise.all([
    ds.examTemplates.list(),
    ds.courses.list(),
    loadAllExamEmailTemplates(),
  ]);
  // Reuse the list already in hand: courses.list() is the app's heaviest read
  // and this page used to run it TWICE per render (saves included).
  const upcomingCourses = await getUpcomingCourseLines(4, courses);
  const templates = Object.fromEntries(list.map((tpl) => [tpl.family, tpl])) as Record<
    ExamFamily,
    ExamTemplate
  >;

  // A representative course per family so the editor can mint preview links
  // (the public runner resolves the family template from the course type).
  const pick = (type: string) =>
    courses
      .filter((c) => c.type === type && !c.cancelled)
      .sort((a, b) => b.year - a.year)[0]?.id ?? undefined;
  const previewCourse: Partial<Record<ExamFamily, string>> = {
    nihonshu: pick("certificato"),
    shochu: pick("shochu"),
  };

  return (
    <ExamLibraryEditor
      templates={templates}
      previewCourse={previewCourse}
      emailTemplates={emailTemplates}
      testTo={session?.user?.email || ""}
      upcomingCourses={upcomingCourses}
    />
  );
}
