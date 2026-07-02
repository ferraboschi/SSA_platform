// Personal exam-link invite: build the bound URL + branded HTML + deliver it.
// Server-only; used by the educator-share send actions (share-links).
import "server-only";
import { appConfig, examEmailConfig } from "@/lib/integrations/config";
import { getEmailService } from "@/lib/integrations/email";
import { signExamToken, EXAM_LINK_TTL_HOURS, type ExamTestKey } from "./token";

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

/** Mint a PERSONAL exam URL bound to one corsista (`s`), for one test. */
export function buildPersonalExamUrl(
  courseId: string,
  testKey: ExamTestKey,
  corsistaId: string,
  ttlHours: number = EXAM_LINK_TTL_HOURS.exam,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const token = signExamToken({ c: courseId, t: testKey, m: "exam", s: corsistaId, e: exp });
  return `${appConfig.baseUrl.replace(/\/$/, "")}/esame/${token}`;
}

export function renderExamInviteEmailHtml(
  name: string,
  courseName: string,
  testLabel: string,
  url: string,
): string {
  const hi = name ? `Ciao ${escapeHtml(name)},` : "Ciao,";
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">` +
    `<h2 style="font-size:18px;margin:0 0 10px">${escapeHtml(testLabel)}</h2>` +
    `<p style="font-size:14px;line-height:1.6;margin:0 0 6px">${hi}</p>` +
    `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Per il corso <strong>${escapeHtml(courseName)}</strong> è disponibile <strong>${escapeHtml(testLabel)}</strong>. Il link qui sotto è personale: aprilo tu, non inoltrarlo.</p>` +
    `<p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Apri ${escapeHtml(testLabel)}</a></p>` +
    `<p style="font-size:12px;color:#6b7280;word-break:break-all;margin:0 0 10px">Se il pulsante non funziona, copia questo link:<br/>${url}</p>` +
    `<p style="font-size:12px;color:#9ca3af;margin:0">Se non ti aspettavi questo messaggio, puoi ignorarlo.</p>` +
    `</div>`
  );
}

export interface DeliverExamInviteArgs {
  courseId: string;
  testKey: ExamTestKey;
  corsistaId: string;
  testLabel: string;
  /** The student's confirmed/target email (the live recipient). */
  toEmail: string;
  name: string;
  courseName: string;
  /** Test-mode routing (staff inbox); omit on the public share path → link only. */
  fallbackTo?: string;
  ttlHours?: number;
}
export interface DeliverExamInviteResult {
  /** Always returned so the caller has a Copia-link / WhatsApp-SMS fallback. */
  url: string;
  sentTo?: string;
  live: boolean;
  error?: string;
}

/**
 * Mint the personal exam link + (go-live gated) send it. When
 * EXAM_RESULT_EMAILS_LIVE is off, no student is emailed: it routes to `fallbackTo`
 * (staff) or, absent that, returns the link for manual WhatsApp/SMS delivery.
 */
export async function deliverExamInvite(a: DeliverExamInviteArgs): Promise<DeliverExamInviteResult> {
  const url = buildPersonalExamUrl(a.courseId, a.testKey, a.corsistaId, a.ttlHours);
  const live = examEmailConfig.live;
  const dest = live ? a.toEmail.trim() : (a.fallbackTo ?? "").trim();
  if (!dest) {
    return {
      url,
      live,
      error: live
        ? "Nessuna email nota — usa il link (WhatsApp/SMS)."
        : "Modalità test — email non inviata, usa il link.",
    };
  }
  try {
    const html = renderExamInviteEmailHtml(a.name, a.courseName, a.testLabel, url);
    const r = await getEmailService().send({
      to: dest,
      subject: live ? `${a.testLabel} — SSA` : `[PROVA] ${a.testLabel} — SSA`,
      html,
      tag: "exam-invite",
    });
    if (r.status === "skipped") {
      return { url, live, error: "Email non configurata (Resend assente) — usa il link." };
    }
    return { url, live, sentTo: dest };
  } catch {
    return { url, live, error: "Invio non riuscito — usa il link (Copia)." };
  }
}
