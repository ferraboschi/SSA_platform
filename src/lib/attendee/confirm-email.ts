// Confirmation magic-link email: build the URL + branded HTML + deliver it.
// Server-only; shared by the staff action (attendee/confirm-actions.ts) and the
// token-authorized educator-share action (share-links/attendance-actions.ts).
import "server-only";
import { appConfig, examEmailConfig } from "@/lib/integrations/config";
import { getEmailService } from "@/lib/integrations/email";
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
 *  inbox); "manual" (WhatsApp/SMS/copy) keeps it editable. */
export function buildConfirmUrl(
  courseId: string,
  kind: ConfirmSubjectKind,
  subjectId: string,
  channel: "email" | "manual",
  lang?: string,
): string {
  const exp = Math.floor(Date.now() / 1000) + CONFIRM_LINK_TTL_HOURS * 3600;
  const token = signConfirmToken({ c: courseId, k: kind, i: subjectId, ch: channel, l: lang, e: exp });
  return `${appConfig.baseUrl.replace(/\/$/, "")}/conferma/${token}`;
}

export function renderConfirmEmailHtml(name: string, courseName: string, url: string): string {
  const hi = name ? `Ciao ${escapeHtml(name)},` : "Ciao,";
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">` +
    `<h2 style="font-size:18px;margin:0 0 10px">Conferma i tuoi dati</h2>` +
    `<p style="font-size:14px;line-height:1.6;margin:0 0 6px">${hi}</p>` +
    `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Per il corso <strong>${escapeHtml(courseName)}</strong> ti chiediamo di confermare il tuo indirizzo email: è quello a cui riceverai i mini-test e l'esame finale.</p>` +
    `<p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Conferma i miei dati</a></p>` +
    `<p style="font-size:12px;color:#6b7280;word-break:break-all;margin:0 0 10px">Se il pulsante non funziona, copia questo link:<br/>${url}</p>` +
    `<p style="font-size:12px;color:#9ca3af;margin:0">Se non ti aspettavi questo messaggio, puoi ignorarlo.</p>` +
    `</div>`
  );
}

export interface DeliverConfirmArgs {
  courseId: string;
  kind: ConfirmSubjectKind;
  subjectId: string;
  /** The attendee's confirmed/target email (the live recipient). */
  toEmail: string;
  name: string;
  courseName: string;
  lang?: string;
  /**
   * Where to route in TEST mode (EXAM_RESULT_EMAILS_LIVE=false). Pass the acting
   * staff email for the internal path; omit on the public educator-share path
   * (no session) → in test mode we DON'T send, only return the link to copy.
   */
  fallbackTo?: string;
}
export interface DeliverConfirmResult {
  /** MANUAL-channel link (editable email) — always returned so the caller has a
   *  Copia-link / WhatsApp-SMS fallback. */
  url: string;
  sentTo?: string;
  live: boolean;
  error?: string;
}

/**
 * Mint + (conditionally) send the confirmation link. Go-live gated: when
 * EXAM_RESULT_EMAILS_LIVE is off, no email reaches a real attendee — it either
 * routes to `fallbackTo` (staff) or isn't sent at all (link returned for manual
 * WhatsApp/SMS delivery).
 *
 * Two distinct links: the one INSIDE the email carries channel "email" (the
 * page locks the email field — delivery proved the inbox); the returned copy
 * link carries "manual" (email editable, confirmed by typing).
 */
export async function deliverConfirmLink(a: DeliverConfirmArgs): Promise<DeliverConfirmResult> {
  const url = buildConfirmUrl(a.courseId, a.kind, a.subjectId, "manual", a.lang);
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
    const emailUrl = buildConfirmUrl(a.courseId, a.kind, a.subjectId, "email", a.lang);
    const html = renderConfirmEmailHtml(a.name, a.courseName, emailUrl);
    const r = await getEmailService().send({
      to: dest,
      subject: live ? "Conferma i tuoi dati — SSA" : "[PROVA] Conferma dati — SSA",
      html,
      tag: "attendee-confirm",
    });
    if (r.status === "skipped") {
      return { url, live, error: "Email non configurata (Resend assente) — usa il link." };
    }
    return { url, sentTo: dest, live };
  } catch {
    return { url, live, error: "Invio non riuscito — usa il link (Copia)." };
  }
}
