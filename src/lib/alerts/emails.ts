// Operational alert emails. Server-only.
//
//  • Stock / low-stock alerts  → Camilla (alertRecipients.stock)
//  • Course-ended "da fatturare" → Luigi  (alertRecipients.invoice)
//
// All mail flows through the single EmailService seam (Resend in prod, stub
// otherwise), so these work end-to-end even before Resend is configured.
import "server-only";
import { appConfig, alertRecipients } from "@/lib/integrations/config";
import { getEmailService, type EmailSendResult } from "@/lib/integrations/email";
import { loadExamEmailTemplates } from "@/lib/esami/exam-email-store";
import { renderExamEmail, OUTCOME_LABEL_IT } from "@/lib/esami/exam-email";

function loginLink(path = "/dashboard"): string {
  const base = appConfig.baseUrl.replace(/\/$/, "");
  return `${base}${path}`;
}

function shell(title: string, bodyHtml: string, cta: { href: string; label: string }): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">Sake Sommelier Association</div>
    <h2 style="font-size:18px;margin:8px 0 14px">${title}</h2>
    ${bodyHtml}
    <p style="margin:22px 0 6px">
      <a href="${cta.href}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${cta.label}</a>
    </p>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">Email automatica · piattaforma SSA</p>
  </div>`;
}

export interface StockAlertRow {
  name: string;
  code: string;
  stock: number | null;
  min: number;
}

/** Low-stock alert → Camilla, with a brief and a login link. */
export async function sendStockAlertEmail(
  alertLabel: string,
  rows: StockAlertRow[],
  toOverride?: string,
): Promise<EmailSendResult> {
  const list = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name} <span style="color:#9ca3af;font-family:monospace;font-size:11px">${r.code}</span></td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#b42318;font-weight:700">${r.stock ?? "—"} pz</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#6b7280">min ${r.min}</td>
        </tr>`,
    )
    .join("");
  const html = shell(
    `⚠️ Scorta bassa: ${alertLabel}`,
    `<p style="font-size:14px;line-height:1.5">Uno o più SKU monitorati sono <strong>sotto la soglia minima</strong>. Verifica e riordina.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">${list}</table>`,
    { href: loginLink("/dashboard"), label: "Apri la dashboard" },
  );
  return getEmailService().send({
    to: toOverride || alertRecipients.stock,
    subject: `⚠️ Allerta scorte SSA — ${alertLabel}`,
    html,
    tag: "stock-alert",
  });
}

export interface MismatchCourse {
  id: string;
  title: string;
  city: string;
  month: string;
  year: number;
  educator: string;
  typeLabel: string;
}

/** An educator assigned to a course type they aren't qualified for → Camilla. */
export async function sendEducatorMismatchEmail(course: MismatchCourse): Promise<EmailSendResult> {
  const html = shell(
    `⚠️ Educator non abilitato`,
    `<p style="font-size:14px;line-height:1.5"><strong>${course.educator}</strong> è assegnato al corso <strong>${course.title}</strong> (${course.typeLabel}) ma <strong>non risulta abilitato</strong> a questa tipologia. Verifica l'assegnazione.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
       <tr><td style="padding:5px 0;color:#6b7280">Corso</td><td style="padding:5px 0;text-align:right;font-weight:600">${course.title}</td></tr>
       <tr><td style="padding:5px 0;color:#6b7280">Luogo / data</td><td style="padding:5px 0;text-align:right">${course.city} · ${course.month} ${course.year}</td></tr>
       <tr><td style="padding:5px 0;color:#6b7280">Educator</td><td style="padding:5px 0;text-align:right">${course.educator}</td></tr>
     </table>`,
    { href: loginLink(`/corsi/${course.id}`), label: "Apri il corso" },
  );
  return getEmailService().send({
    to: alertRecipients.stock, // operations → Camilla
    subject: `⚠️ Educator non abilitato — ${course.title}`,
    html,
    tag: "educator-mismatch",
  });
}

export interface ReminderCourse {
  id: string;
  title: string;
  city: string;
  month: string;
  year: number;
  daysToStart: number;
}

/** Time-based logistics reminder (ship books / ship exam sakes) → operations. */
export async function sendCourseReminderEmail(
  kind: "books" | "exam-sakes",
  course: ReminderCourse,
): Promise<EmailSendResult> {
  const what = kind === "books" ? "i libri del corso" : "i sake per l'esame";
  const title = kind === "books" ? "📦 Spedire i libri" : "🍶 Spedire i sake d'esame";
  const html = shell(
    title,
    `<p style="font-size:14px;line-height:1.5">Il corso inizia tra <strong>${course.daysToStart} giorni</strong>: è il momento di preparare e spedire <strong>${what}</strong>.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
       <tr><td style="padding:5px 0;color:#6b7280">Corso</td><td style="padding:5px 0;text-align:right;font-weight:600">${course.title}</td></tr>
       <tr><td style="padding:5px 0;color:#6b7280">Luogo / data</td><td style="padding:5px 0;text-align:right">${course.city} · ${course.month} ${course.year}</td></tr>
     </table>`,
    { href: loginLink(`/corsi/${course.id}`), label: "Apri il corso" },
  );
  return getEmailService().send({
    to: alertRecipients.stock, // operations → Camilla
    subject: `${title} — ${course.title} (tra ${course.daysToStart} gg)`,
    html,
    tag: `reminder-${kind}`,
  });
}

export interface ExamResultEmailInput {
  /** Recipient (the student; during testing routed to the admin by the action). */
  to: string;
  studentName: string;
  courseTitle: string;
  scorePct: number;
  status: "passed" | "retrial" | "failed";
  /** Link to the printable certificate/report (student can save it as PDF). */
  reportUrl: string;
  /** Optional pre-rendered PDF certificate to attach (base64). */
  pdf?: { filename: string; base64: string };
}

/** Personal exam-result email to the student. Uses the staff-editable templates
 *  (one per outcome), rendered with the student's data + certificate link. */
export async function sendExamResultEmail(input: ExamResultEmailInput): Promise<EmailSendResult> {
  const templates = await loadExamEmailTemplates();
  const { subject, html } = renderExamEmail(
    templates[input.status],
    {
      nome: input.studentName,
      corso: input.courseTitle,
      punteggio: input.scorePct,
      esito: OUTCOME_LABEL_IT[input.status],
    },
    input.reportUrl,
  );
  return getEmailService().send({
    to: input.to,
    subject,
    html,
    tag: "exam-result",
    attachments: input.pdf
      ? [{ filename: input.pdf.filename, content: input.pdf.base64, contentType: "application/pdf" }]
      : undefined,
  });
}

export interface InvoiceCourse {
  id: string;
  title: string;
  city: string;
  month: string;
  year: number;
  enrolled: number;
  revenue: number;
}

/** Course-ended "da fatturare" notice → Luigi (accounting). */
export async function sendInvoiceNoticeEmail(course: InvoiceCourse): Promise<EmailSendResult> {
  const html = shell(
    `🧾 Corso da fatturare`,
    `<p style="font-size:14px;line-height:1.5">Il corso è terminato ed è pronto per la fatturazione.</p>
     <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
       <tr><td style="padding:5px 0;color:#6b7280">Corso</td><td style="padding:5px 0;text-align:right;font-weight:600">${course.title}</td></tr>
       <tr><td style="padding:5px 0;color:#6b7280">Luogo / data</td><td style="padding:5px 0;text-align:right">${course.city} · ${course.month} ${course.year}</td></tr>
       <tr><td style="padding:5px 0;color:#6b7280">Iscritti</td><td style="padding:5px 0;text-align:right">${course.enrolled}</td></tr>
       <tr><td style="padding:5px 0;color:#6b7280">Incasso netto</td><td style="padding:5px 0;text-align:right">€ ${course.revenue.toLocaleString("it-IT")}</td></tr>
     </table>`,
    { href: loginLink(`/corsi/${course.id}`), label: "Apri il corso" },
  );
  return getEmailService().send({
    to: alertRecipients.invoice,
    subject: `🧾 Corso da fatturare — ${course.title}`,
    html,
    tag: "invoice-notice",
  });
}
