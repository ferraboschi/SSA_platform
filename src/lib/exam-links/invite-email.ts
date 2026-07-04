// Personal exam-link invite: build the bound URL + branded HTML + deliver it.
// Server-only; used by the educator-share send actions (share-links).
import "server-only";
import { appConfig } from "@/lib/integrations/config";
import { getEmailService } from "@/lib/integrations/email";
import { renderBrandedEmailHtml, SUPPORT_EMAIL } from "@/lib/integrations/email/branded-template";
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

/** Branded card shell (SSA badge, serif headline, black pill button) shared
 *  with the confirm-your-data email — see integrations/email/branded-template.ts. */
export function renderExamInviteEmailHtml(
  name: string,
  courseName: string,
  testLabel: string,
  url: string,
): string {
  const hi = name ? `${escapeHtml(name.split(" ")[0])}, ` : "";
  return renderBrandedEmailHtml({
    heading: escapeHtml(testLabel),
    subtitle: `${hi}per il corso <strong>${escapeHtml(courseName)}</strong> è disponibile <strong>${escapeHtml(testLabel)}</strong>. Il link è personale: aprilo tu, non inoltrarlo.`,
    ctaLabel: `Apri ${escapeHtml(testLabel)}`,
    ctaUrl: url,
    footerHtml:
      `Il pulsante non funziona? Copia questo indirizzo: <span style="word-break:break-all">${url}</span><br>` +
      `Se non ti aspettavi questo messaggio, puoi ignorarlo.<br>` +
      `Per assistenza scrivi a <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a1a1a;text-decoration:underline">${SUPPORT_EMAIL}</a>`,
  });
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
