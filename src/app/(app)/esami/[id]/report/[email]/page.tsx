import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { getDataSource } from "@/lib/data";
import { requireNavAccess } from "@/lib/auth/guard";
import { EsameReport } from "@/components/esami/EsameReport";
import { loadCourseExamResults, findConfirmedResultByEmail } from "@/lib/exam-links/results";
import { buildCertificateData } from "@/lib/esami/certificate-data";
import { getClassAverage } from "@/lib/esami/class-average";
import type { ExamFamily, ExamResult, ExamResultStatus } from "@/lib/domain";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; email: string }>;
}) {
  // Exam-access guard — same as the sibling results/editor pages. Without it any
  // logged-in staff member (including roles blocked from exams) could read any
  // student's certificate, score, wrong answers and personal data by URL, and
  // enumerate students by email.
  await requireNavAccess("esami");
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
  let classAvg: number | null = null;
  if (course && family) {
    const subs = await loadCourseExamResults(id, family);
    // Only a CONFIRMED outcome yields a certificate — matching the email/PDF/
    // attendance consumers. Deterministic when a companion shares the buyer's
    // email (corsista row wins) — see findConfirmedResultByEmail.
    const sub = findConfirmedResultByEmail(subs, decoded);
    if (sub) {
      // Same enrichment the emailed PDF gets, so the printable staff report and
      // the student's resoconto stay in lock-step (owner batch 16). The HTML
      // report shows the areas; the open-answer review is a PDF-only page.
      const docLang = sub.lang === "en" ? "en" : sub.lang === "ja" ? "ja" : "it";
      const [certData, avg] = await Promise.all([
        buildCertificateData(course.id, family, subs, sub, docLang).catch(() => ({ sections: [], openReview: [] })),
        getClassAverage(family).catch(() => null),
      ]);
      const secs = certData.sections;
      classAvg = avg;
      result = {
        email: sub.studentEmail,
        name: sub.studentName,
        score: sub.currentScore,
        status: (sub.currentResult as ExamResultStatus | null) ?? sub.suggested,
        completedAt: sub.submittedAt,
        durationMin: 0,
        sections: secs.map((s) => ({ cat: s.name, label: s.name, short: s.name, pct: s.pct })),
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
      classAvg={classAvg}
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
