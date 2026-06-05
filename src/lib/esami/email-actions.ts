"use server";

// Exam-result email: sends a student their personal result + a link to the
// printable certificate, straight to the student's address. Admin/manager only.

import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { appConfig } from "@/lib/integrations/config";
import { sendExamResultEmail } from "@/lib/alerts/emails";
import { renderCertificatePdf } from "./certificate-pdf";
import type { ExamFamily } from "@/lib/domain";

export interface SendExamResultResult {
  ok: boolean;
  /** "sent" (Resend) or "skipped" (stub / no RESEND_API_KEY). */
  status?: string;
  /** Where the mail actually went. */
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
    } catch (e) {
      // Don't fail the send, but surface that the certificate is missing.
      console.error("Exam result PDF render failed:", e);
    }

    const res = await sendExamResultEmail({
      to: email, // the student's address
      studentName: result.name,
      courseTitle: course.shortTitle || course.title,
      scorePct: result.score,
      status: result.status,
      reportUrl,
      pdf,
    });
    const status = !pdf && res.status === "sent" ? "sent_without_attachment" : res.status;
    return { ok: true, status, sentTo: email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invio non riuscito." };
  }
}
