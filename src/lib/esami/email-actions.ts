"use server";

// Exam-result email: sends a student their personal result + a link to the
// printable certificate. During testing it routes to the admin inbox (like the
// other alert emails) until the flow is verified, then the `to` becomes the
// student's address. Admin/manager only.

import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { appConfig } from "@/lib/integrations/config";
import { sendExamResultEmail } from "@/lib/alerts/emails";
import { renderCertificatePdf } from "./certificate-pdf";
import type { ExamFamily } from "@/lib/domain";

// TESTING: route result emails here until the flow is verified end-to-end.
const TEST_TO = "lorenzo@ef-ti.com";

export interface SendExamResultResult {
  ok: boolean;
  /** "sent" (Resend) or "skipped" (stub / no RESEND_API_KEY). */
  status?: string;
  /** Where the mail actually went (test inbox while testing). */
  sentTo?: string;
  error?: string;
}

export async function sendExamResultEmailAction(
  courseId: string,
  email: string,
): Promise<SendExamResultResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  const ds = await getDataSource();
  const course = await ds.courses.getById(courseId);
  const result = course?.examResults2?.find((r) => r.email === email);
  if (!course || !result) return { ok: false, error: "Esito non trovato." };

  const base = appConfig.baseUrl.replace(/\/$/, "");
  const reportUrl = `${base}/esami/${courseId}/report/${encodeURIComponent(email)}`;
  const family: ExamFamily = course.type === "shochu" ? "shochu" : "nihonshu";
  try {
    // Attach the IT+EN certificate PDF (JA is available via the report link).
    let pdf: { filename: string; base64: string } | undefined;
    try {
      const buf = await renderCertificatePdf({
        name: result.name,
        family,
        status: result.status,
        score: result.score,
        sections: result.sections.map((s) => ({ label: s.label, pct: s.pct })),
        course: {
          day: course.day,
          month: course.month,
          year: course.year,
          city: course.city,
          educatorName: course.educator.name,
        },
        completedAt: result.completedAt,
      });
      const slug = result.name.normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
      pdf = { filename: `certificato-${slug || "esame"}.pdf`, base64: buf.toString("base64") };
    } catch {
      /* PDF render failed → still send the email with the report link */
    }

    const res = await sendExamResultEmail({
      to: TEST_TO, // TESTING: send to admin; switch to `email` (student) once verified
      studentName: result.name,
      courseTitle: course.shortTitle || course.title,
      scorePct: result.score,
      status: result.status,
      reportUrl,
      pdf,
    });
    return { ok: true, status: res.status, sentTo: TEST_TO };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invio non riuscito." };
  }
}
