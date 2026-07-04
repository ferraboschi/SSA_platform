// Confirmation magic-link email: build the URL + branded HTML + deliver it.
// Server-only; shared by the staff action (attendee/confirm-actions.ts) and the
// token-authorized educator-share action (share-links/attendance-actions.ts).
//
// DELIVERY IS LIVE by design (owner decision 2026-07-03): confirming the
// student's email is the whole point, so this email goes straight to the
// attendee address — it is NOT gated by EXAM_RESULT_EMAILS_LIVE (which keeps
// gating exam invites/results). The educator triggers each send explicitly.
import "server-only";
import { appConfig } from "@/lib/integrations/config";
import { getEmailService } from "@/lib/integrations/email";
import { renderBrandedEmailHtml, SUPPORT_EMAIL } from "@/lib/integrations/email/branded-template";
import {
  signConfirmToken,
  CONFIRM_LINK_TTL_HOURS,
  type ConfirmSubjectKind,
} from "./confirm-token";

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

/** Mint a fresh confirmation magic-link URL for one attendee.
 *  `channel`: "email" locks the email field on the page (delivery proves the
 *  inbox); "manual" (WhatsApp/SMS/copy) keeps it editable. Carries `ia` so a
 *  link issued BEFORE a completed confirmation reads as closed. */
export function buildConfirmUrl(
  courseId: string,
  kind: ConfirmSubjectKind,
  subjectId: string,
  channel: "email" | "manual",
  lang?: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const token = signConfirmToken({
    c: courseId,
    k: kind,
    i: subjectId,
    ch: channel,
    ia: now,
    l: lang,
    e: now + CONFIRM_LINK_TTL_HOURS * 3600,
  });
  return `${appConfig.baseUrl.replace(/\/$/, "")}/conferma/${token}`;
}

/** Branded card shell (SSA badge, serif headline, black pill button) shared
 *  with the exam-invite email — see integrations/email/branded-template.ts. */
export function renderConfirmEmailHtml(name: string, courseName: string, url: string): string {
  const hi = name ? `${escapeHtml(name.split(" ")[0])}, ` : "";
  return renderBrandedEmailHtml({
    heading: "Conferma i tuoi dati",
    subtitle: `${hi}per il corso <strong>${escapeHtml(courseName)}</strong> — servono per i mini-test e l'esame finale.`,
    ctaLabel: "Conferma i miei dati",
    ctaUrl: url,
    footerHtml:
      `Il pulsante non funziona? Copia questo indirizzo: <span style="word-break:break-all">${url}</span><br>` +
      `Se non hai richiesto questa email, puoi ignorarla.<br>` +
      `Per assistenza scrivi a <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a1a1a;text-decoration:underline">${SUPPORT_EMAIL}</a>`,
  });
}

export interface DeliverConfirmArgs {
  courseId: string;
  kind: ConfirmSubjectKind;
  subjectId: string;
  /** The attendee's target email (the actual recipient). */
  toEmail: string;
  name: string;
  courseName: string;
  lang?: string;
}
export interface DeliverConfirmResult {
  /** MANUAL-channel link (editable email) — always returned so the caller has a
   *  Copia-link / WhatsApp-SMS fallback. */
  url: string;
  sentTo?: string;
  error?: string;
}

/**
 * Mint + send the confirmation link — LIVE, straight to the attendee (the
 * educator triggers each send explicitly; delivery IS the verification step).
 * No known email → link-only (WhatsApp/SMS hand-over).
 *
 * Two distinct links: the one INSIDE the email carries channel "email" (the
 * page locks the email field — delivery proved the inbox); the returned copy
 * link carries "manual" (email editable, confirmed by typing).
 */
export async function deliverConfirmLink(a: DeliverConfirmArgs): Promise<DeliverConfirmResult> {
  const url = buildConfirmUrl(a.courseId, a.kind, a.subjectId, "manual", a.lang);
  const dest = a.toEmail.trim();
  if (!dest) {
    return { url, error: "Nessuna email nota — usa il link (WhatsApp/SMS)." };
  }
  try {
    const emailUrl = buildConfirmUrl(a.courseId, a.kind, a.subjectId, "email", a.lang);
    const html = renderConfirmEmailHtml(a.name, a.courseName, emailUrl);
    const r = await getEmailService().send({
      to: dest,
      subject: "Conferma i tuoi dati — SSA",
      html,
      tag: "attendee-confirm",
    });
    if (r.status === "skipped") {
      return { url, error: "Email non configurata (Resend assente) — usa il link." };
    }
    return { url, sentTo: dest };
  } catch {
    return { url, error: "Invio non riuscito — usa il link (Copia)." };
  }
}
