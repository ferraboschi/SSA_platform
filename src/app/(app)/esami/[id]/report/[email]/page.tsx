import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { EsameReport } from "@/components/esami/EsameReport";
import { loadCourseExamResults } from "@/lib/exam-links/results";
import type { ExamFamily, ExamResult, ExamResultStatus } from "@/lib/domain";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; email: string }>;
}) {
  const { id, email } = await params;
  const ds = await getDataSource();
  const [{ t }, course] = await Promise.all([getTranslations(), ds.courses.getById(id)]);
  const rv = t.esami.reportView;

  // Decode defensively (a malformed %xx must not 500).
  let decoded = email;
  try {
    decoded = decodeURIComponent(email);
  } catch {
    /* keep raw segment */
  }

  // The certificate is built from the REAL graded submissions (the demo-only
  // examResults2 is never populated in production), matched EXACTLY by email —
  // never a [0] fallback, which would leak another student's certificate + PII.
  const family: ExamFamily | null =
    course?.type === "certificato" ? "nihonshu" : course?.type === "shochu" ? "shochu" : null;

  let result: ExamResult | null = null;
  if (course && family) {
    const subs = await loadCourseExamResults(id, family);
    const low = decoded.toLowerCase();
    // Only a CONFIRMED outcome yields a certificate — matching the email/PDF/
    // attendance consumers. An unconfirmed submission falls through to the
    // "unavailable" card instead of showing a provisional auto-result.
    const sub = subs.find((s) => s.studentEmail.toLowerCase() === low && s.currentResult);
    if (sub) {
      result = {
        email: sub.studentEmail,
        name: sub.studentName,
        score: sub.currentScore ?? sub.autoScore,
        status: (sub.currentResult as ExamResultStatus | null) ?? sub.suggested,
        completedAt: sub.submittedAt,
        durationMin: 0,
        sections: [],
        wrongImportant: sub.answers
          .filter((a) => a.ok === false)
          .map((a) => ({
            questionId: a.qid,
            cat: "",
            text: a.text,
            wrongAnswer: a.given,
            correctAnswer: a.correct,
          })),
      };
    }
  }

  if (!course || !family || !result) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 14 }}>{rv.unavailable}</div>
          <Link className="btn" href={`/esami/${id}`}>
            {t.esami.detail.backLink}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <EsameReport
      result={result}
      family={family}
      courseId={id}
      course={{
        day: course.day,
        month: course.month,
        year: course.year,
        city: course.city,
        educatorName: course.educator.name,
      }}
    />
  );
}
