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

/** Same visual shell as the staff invite / password-setup email (header brand
 *  line, headline, CTA button, plaintext-link fallback, quiet disclaimer). */
export function renderConfirmEmailHtml(name: string, courseName: string, url: string): string {
  const hi = name ? `${escapeHtml(name.split(" ")[0])}, ` : "";
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">Sake Sommelier Association</div>
    <h2 style="font-size:18px;margin:8px 0 14px">Conferma i tuoi dati per il corso</h2>
    <p style="font-size:14px;line-height:1.5">${hi}per il corso <strong>${escapeHtml(courseName)}</strong> ti chiediamo di confermare i tuoi dati: l'email è l'indirizzo a cui riceverai i mini-test e l'esame finale.</p>
    <p style="margin:22px 0 6px"><a href="${url}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Conferma i miei dati</a></p>
    <p style="font-size:12px;color:#6b7280;margin-top:10px">Oppure copia questo indirizzo nel browser:<br><span style="word-break:break-all;color:#4f46e5">${url}</span></p>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">Se non aspettavi questo messaggio, puoi ignorarlo. · Sake Sommelier Association</p>
  </div>`;
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
