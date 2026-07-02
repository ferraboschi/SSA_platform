"use server";

import { getSession } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { verifyConfirmToken, type ConfirmSubjectKind } from "./confirm-token";
import { loadConfirmSubject } from "./confirm";
import { deliverConfirmLink } from "./confirm-email";

function normEmail(s: string): string {
  return s.trim().toLowerCase();
}
function isValidEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254;
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

  // Staff path: in test mode route to the acting staff's own inbox.
  const res = await deliverConfirmLink({
    courseId: input.courseId,
    kind: input.kind,
    subjectId: input.subjectId,
    toEmail: subject.email,
    name: subject.fullName,
    courseName: subject.courseName,
    lang: input.lang,
    fallbackTo: session?.user?.email ?? "",
  });
  return { ok: true, ...res };
}
