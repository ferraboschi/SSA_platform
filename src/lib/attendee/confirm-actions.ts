"use server";

import { getSession } from "@/lib/auth/session";
import { appConfig, examEmailConfig } from "@/lib/integrations/config";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { getEmailService } from "@/lib/integrations/email";
import {
  signConfirmToken,
  verifyConfirmToken,
  CONFIRM_LINK_TTL_HOURS,
  type ConfirmSubjectKind,
} from "./confirm-token";
import { loadConfirmSubject } from "./confirm";

function normEmail(s: string): string {
  return s.trim().toLowerCase();
}
function isValidEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254;
}
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

/**
 * PUBLIC save from the confirmation magic-link page. The subject (course + kind +
 * id) is taken from the VERIFIED token, never the client. Writes the CONFIRMED
 * email snapshot + the confirmed-at flag (the educator's green tick). The global
 * corsisti.email identity is intentionally left untouched.
 */
export async function confirmAttendeeAction(
  token: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = verifyConfirmToken(token);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const clean = normEmail(email);
  if (!isValidEmail(clean)) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }

  const { c, k, i } = res.payload;
  const svc = getSupabaseServiceClient();
  const now = new Date().toISOString();

  const table = k === "corsista" ? "corsi_iscrizioni" : "corsi_partecipanti";
  const patch =
    k === "corsista"
      ? { enrolled_email: clean, email_confirmed_at: now }
      : { email: clean, email_confirmed_at: now };
  const { error } = await svc
    .from(table)
    .update(patch)
    .eq("id", Number(i))
    .eq("corso_id", Number(c));
  if (error) {
    return { ok: false, error: "Salvataggio non riuscito (migrazione non applicata?)." };
  }
  return { ok: true };
}

export interface SendConfirmLinkInput {
  courseId: string;
  kind: ConfirmSubjectKind;
  subjectId: string;
  lang?: string;
}
export interface SendConfirmLinkResult {
  ok: boolean;
  /** Always returned so the UI has a Copia-link / WhatsApp fallback. */
  url?: string;
  /** Who the email actually went to (staff in test mode, student when live). */
  sentTo?: string;
  /** Whether EXAM_RESULT_EMAILS_LIVE is on (live → real students). */
  live?: boolean;
  error?: string;
}

/**
 * Staff/educator action: mint a confirmation magic-link for one attendee and
 * email it. Gated by the same go-live switch as result emails — until
 * EXAM_RESULT_EMAILS_LIVE=true, the email routes to the ACTING STAFF (never a
 * real student). The link is always returned so it can be copied for WhatsApp/SMS.
 */
export async function sendConfirmLinkAction(
  input: SendConfirmLinkInput,
): Promise<SendConfirmLinkResult> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }

  const subject = await loadConfirmSubject(input.courseId, input.kind, input.subjectId);
  if (!subject) return { ok: false, error: "Destinatario non trovato." };

  const exp = Math.floor(Date.now() / 1000) + CONFIRM_LINK_TTL_HOURS * 3600;
  const token = signConfirmToken({
    c: input.courseId,
    k: input.kind,
    i: input.subjectId,
    l: input.lang,
    e: exp,
  });
  const url = `${appConfig.baseUrl.replace(/\/$/, "")}/conferma/${token}`;

  const live = examEmailConfig.live;
  const dest = live ? subject.email : session?.user?.email ?? "";
  // Live but no known email (e.g. a companion not yet given one): hand back the
  // link so the educator can deliver it via WhatsApp/SMS — the page still asks
  // for (and verifies) the email there.
  if (!dest) {
    return { ok: true, url, live, error: "Nessuna email nota — usa il link (WhatsApp/SMS)." };
  }

  try {
    const hi = subject.fullName ? `Ciao ${escapeHtml(subject.fullName)},` : "Ciao,";
    const html =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">` +
      `<h2 style="font-size:18px;margin:0 0 10px">Conferma i tuoi dati</h2>` +
      `<p style="font-size:14px;line-height:1.6;margin:0 0 6px">${hi}</p>` +
      `<p style="font-size:14px;line-height:1.6;margin:0 0 16px">Per il corso <strong>${escapeHtml(subject.courseName)}</strong> ti chiediamo di confermare il tuo indirizzo email: è quello a cui riceverai i test e l'esame.</p>` +
      `<p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Conferma i miei dati</a></p>` +
      `<p style="font-size:12px;color:#6b7280;word-break:break-all;margin:0 0 10px">Se il pulsante non funziona, copia questo link:<br/>${url}</p>` +
      `<p style="font-size:12px;color:#9ca3af;margin:0">Se non ti aspettavi questo messaggio, puoi ignorarlo.</p>` +
      `</div>`;
    const r = await getEmailService().send({
      to: dest,
      subject: live ? "Conferma i tuoi dati — SSA" : "[PROVA] Conferma dati corsista — SSA",
      html,
      tag: "attendee-confirm",
    });
    if (r.status === "skipped") {
      return { ok: true, url, live, error: "Email non configurata (Resend assente) — usa il link." };
    }
    return { ok: true, url, sentTo: dest, live };
  } catch {
    return { ok: true, url, live, error: "Invio non riuscito — usa il link (Copia)." };
  }
}
