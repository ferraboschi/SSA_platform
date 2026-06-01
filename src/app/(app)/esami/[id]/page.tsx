import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import {
  buildTests,
  buildFeedbackTest,
  toExamCourseHeader,
  courseRosterStudents,
} from "@/lib/esami";
import { ExamCourseDetail } from "@/components/esami/ExamCourseDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = await getDataSource();
  const [{ t }, course] = await Promise.all([getTranslations(), ds.courses.getById(id)]);
  const td = t.esami.detail;

  if (!course) {
    return (
      <div className="page">
        <div className="card card-pad-lg">
          {td.notFound}{" "}
          <Link className="link" href="/esami">
            {td.backLink}
          </Link>
        </div>
      </div>
    );
  }

  // Live (Supabase) path: the rich exam object isn't populated. Send the user to
  // the course's Esame tab, which has the working exam links + info.
  if (!course.exam || !course.examMeta) {
    redirect(`/corsi/${course.handle}?tab=esame`);
  }

  const exam = course.exam;
  const meta = course.examMeta;
  const template = await ds.examTemplates.getByFamily(exam.family);
  if (!template) {
    return (
      <div className="page">
        <div className="card card-pad-lg">
          {td.notFound}{" "}
          <Link className="link" href="/esami">
            {td.backLink}
          </Link>
        </div>
      </div>
    );
  }

  const header = toExamCourseHeader(course, meta);
  const tests = buildTests(course, exam, template, meta);
  const feedbackTest = buildFeedbackTest(template, meta);
  const rosterStudents = courseRosterStudents(course);
  const results = course.examResults2 ?? [];

  return (
    <ExamCourseDetail
      header={header}
      tests={tests}
      feedbackTest={feedbackTest}
      rosterStudents={rosterStudents}
      results={results}
    />
  );
}
