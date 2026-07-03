// Personal exam-link invite: build the bound URL + branded HTML + deliver it.
// Server-only; used by the educator-share send actions (share-links).
import "server-only";
import { appConfig } from "@/lib/integrations/config";
import { getEmailService } from "@/lib/integrations/email";
import { signExamToken, type ExamTestKey } from "./token";
import { expiryForChoice, type ExamLinkTtlChoice } from "./lifecycle";

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

/** The subject a personal link binds to: an enrolled corsista (token `s`) or a
 *  "doppio" companion (token `p`). */
export interface ExamSubjectRef {
  kind: "corsista" | "partecipante";
  id: string;
}

/** Mint a PERSONAL exam URL bound to one subject, for one test.
 *  Lifecycle default: the link dies at the END OF THE SEND DAY (Europe/Rome);
 *  the educator can choose "7d" to keep it alive longer (e.g. the feedback).
 *  `ia` (issue time) lets a later CLOSE-ALL cut it off early. */
export function buildPersonalExamUrl(
  courseId: string,
  testKey: ExamTestKey,
  subject: ExamSubjectRef,
  ttl: ExamLinkTtlChoice = "eod",
): string {
  const now = Math.floor(Date.now() / 1000);
  const token = signExamToken({
    c: courseId,
    t: testKey,
    m: "exam",
    ...(subject.kind === "corsista" ? { s: subject.id } : { p: subject.id }),
    ia: now,
    e: expiryForChoice(ttl),
  });
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
  /** Who the link binds to (corsista or "doppio" companion). */
  subject: ExamSubjectRef;
  testLabel: string;
  /** The student's confirmed/target email (the live recipient). */
  toEmail: string;
  name: string;
  courseName: string;
  /** Link duration: "eod" (default, dies end of send day) or "7d" (keep alive). */
  ttl?: ExamLinkTtlChoice;
}
export interface DeliverExamInviteResult {
  /** Always returned so the caller has a Copia-link / WhatsApp-SMS fallback. */
  url: string;
  sentTo?: string;
  error?: string;
}

/**
 * Mint the personal exam link + email it to the student. Educator-triggered
 * invites deliver LIVE (owner decision, same as the confirm-data emails) —
 * only the automated exam RESULT emails keep the EXAM_RESULT_EMAILS_LIVE gate.
 */
export async function deliverExamInvite(a: DeliverExamInviteArgs): Promise<DeliverExamInviteResult> {
  const url = buildPersonalExamUrl(a.courseId, a.testKey, a.subject, a.ttl ?? "eod");
  const dest = a.toEmail.trim();
  if (!dest) {
    return { url, error: "Nessuna email nota — usa il link (WhatsApp/SMS)." };
  }
  try {
    const html = renderExamInviteEmailHtml(a.name, a.courseName, a.testLabel, url);
    const r = await getEmailService().send({
      to: dest,
      subject: `${a.testLabel} — SSA`,
      html,
      tag: "exam-invite",
    });
    if (r.status === "skipped") {
      return { url, error: "Email non configurata (Resend assente) — usa il link." };
    }
    return { url, sentTo: dest };
  } catch {
    return { url, error: "Invio non riuscito — usa il link (Copia)." };
  }
}
