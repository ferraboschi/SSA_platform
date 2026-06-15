"use server";

// Exam-result email: sends a student their personal result + a link to the
// printable certificate, straight to the student's address. Admin/manager only.

import { getDataSource } from "@/lib/data";
import { hasRole } from "@/lib/auth/guard";
import { appConfig } from "@/lib/integrations/config";
import { sendExamResultEmail } from "@/lib/alerts/emails";
import { loadCourseExamResults } from "@/lib/exam-links/results";
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
  opts?: { toOverride?: string },
): Promise<SendExamResultResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  // TEST MODE: while not operational, the caller passes toOverride to route the
  // email to staff instead of the student. Remove the override at go-live.
  const dest = opts?.toOverride?.trim() || email;
  const lowEmail = email.toLowerCase();
  const ds = await getDataSource();
  const course = await ds.courses.getById(courseId);
  if (!course) return { ok: false, error: "Corso non trovato." };
  const family: ExamFamily | null =
    course.type === "certificato" ? "nihonshu" : course.type === "shochu" ? "shochu" : null;
  if (!family) return { ok: false, error: "Questo corso non prevede un esame." };

  // Real confirmed result from the grading flow (not the demo-only examResults2).
  const subs = await loadCourseExamResults(course.id, family);
  const result = subs.find((s) => s.studentEmail.toLowerCase() === lowEmail && s.currentResult);
  if (!result) return { ok: false, error: "Esito non confermato per questo studente." };
  const outcome = result.currentResult as "passed" | "retrial" | "failed";
  // Null when no objective % is certified (all-manual exam / operator override):
  // the certificate + email then show the outcome alone, no misleading number.
  const scorePct = result.currentScore;

  const base = appConfig.baseUrl.replace(/\/$/, "");
  const reportUrl = `${base}/esami/${courseId}/report/${encodeURIComponent(email)}`;
  try {
    // Attach the IT+EN certificate PDF (JA is available via the report link).
    let pdf: { filename: string; base64: string } | undefined;
    try {
      const buf = await renderCertificatePdf({
        name: result.studentName,
        family,
        status: outcome,
        score: scorePct,
        sections: [],
        course: {
          day: course.day,
          month: course.month,
          year: course.year,
          city: course.city,
          educatorName: course.educator.name,
        },
        completedAt: result.submittedAt,
      });
      const slug = result.studentName.normalize("NFKD").replace(/[^\w]+/g, "-").toLowerCase();
      pdf = { filename: `certificato-${slug || "esame"}.pdf`, base64: buf.toString("base64") };
    } catch (e) {
      // Don't fail the send, but surface that the certificate is missing.
      console.error("Exam result PDF render failed:", e);
    }

    const res = await sendExamResultEmail({
      to: dest, // student, or the test override
      studentName: result.studentName,
      courseTitle: course.shortTitle || course.title,
      scorePct,
      status: outcome,
      reportUrl,
      pdf,
    });
    const status = !pdf && res.status === "sent" ? "sent_without_attachment" : res.status;
    return { ok: true, status, sentTo: dest };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invio non riuscito." };
  }
}
