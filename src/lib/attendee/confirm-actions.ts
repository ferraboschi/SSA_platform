"use server";

import { getSession } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { verifyConfirmToken, type ConfirmSubjectKind } from "./confirm-token";
import { normEmail, isValidEmail, normAddress } from "./confirm-normalize";
import { loadConfirmSubject } from "./confirm";
import { deliverConfirmLink } from "./confirm-email";

export interface ConfirmAttendeeInput {
  email: string;
  phone: string;
  deliveryAddress: string;
  /** The written confirmation: "Confermo di abitare all'indirizzo indicato". */
  addressConfirmed: boolean;
}

/**
 * PUBLIC save from the confirmation magic-link page. The subject (course + kind +
 * id) is taken from the VERIFIED token, never the client. ALL fields are
 * mandatory: email (LOCKED to the stored address when the link was delivered by
 * email — receiving it proved the inbox), phone (propagates to the global
 * corsisti row / the companion row, i.e. everywhere the number appears),
 * delivery address (must be explicitly confirmed by the checkbox). Writes the
 * CONFIRMED email snapshot + confirmed-at (the educator's green tick). The
 * global corsisti.email identity is intentionally left untouched.
 */
export async function confirmAttendeeAction(
  token: string,
  input: ConfirmAttendeeInput,
): Promise<{ ok: boolean; error?: string; addressSaved?: boolean }> {
  const res = verifyConfirmToken(token);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const { c, k, i, ch } = res.payload;
  const svc = getSupabaseServiceClient();

  // EMAIL — mandatory. On the "email" channel the client value is IGNORED: the
  // address the link was delivered to is authoritative (server-side lock).
  let clean = normEmail(input.email ?? "");
  if (ch === "email") {
    const subject = await loadConfirmSubject(c, k, i);
    if (!subject) return { ok: false, error: "Destinatario non trovato." };
    clean = normEmail(subject.email);
  }
  if (!isValidEmail(clean)) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }

  // PHONE — mandatory (propagated below).
  const phone = String(input.phone ?? "").trim();
  if (!phone) return { ok: false, error: "Inserisci il numero di telefono." };
  if (phone.length > 40) return { ok: false, error: "Numero di telefono troppo lungo." };

  // ADDRESS — mandatory + explicit written confirmation.
  const addr = normAddress(input.deliveryAddress);
  if (!addr.ok) return { ok: false, error: addr.error };
  if (!addr.value) return { ok: false, error: "Inserisci l'indirizzo di consegna." };
  if (!input.addressConfirmed) {
    return { ok: false, error: "Conferma l'indirizzo spuntando la casella." };
  }

  const now = new Date().toISOString();
  const table = k === "corsista" ? "corsi_iscrizioni" : "corsi_partecipanti";
  const base =
    k === "corsista"
      ? { enrolled_email: clean, email_confirmed_at: now }
      : { email: clean, email_confirmed_at: now };
  const withAddr = { ...base, delivery_address: addr.value };

  let { error } = await svc
    .from(table)
    .update(withAddr)
    .eq("id", Number(i))
    .eq("corso_id", Number(c));
  // Pre-migration degrade: the email confirmation (the primary act) must still
  // succeed when delivery_address doesn't exist yet — retry without it.
  let addressSaved = true;
  if (error && /delivery_address|column/i.test(error.message)) {
    addressSaved = false;
    ({ error } = await svc
      .from(table)
      .update(base)
      .eq("id", Number(i))
      .eq("corso_id", Number(c)));
  }
  if (error) {
    return { ok: false, error: "Salvataggio non riuscito (migrazione non applicata?)." };
  }

  // PHONE propagation: corsista → the GLOBAL corsisti row (everywhere the
  // number appears); companion → its own row. Best-effort: a phone hiccup must
  // not undo the email confirmation above.
  if (k === "corsista") {
    const { data: enr } = await svc
      .from("corsi_iscrizioni")
      .select("corsista_id")
      .eq("id", Number(i))
      .maybeSingle();
    const corsistaId = (enr as { corsista_id: number } | null)?.corsista_id;
    if (corsistaId != null) {
      await svc.from("corsisti").update({ phone }).eq("id", corsistaId);
    }
  } else {
    await svc.from("corsi_partecipanti").update({ phone }).eq("id", Number(i)).eq("corso_id", Number(c));
  }

  return { ok: true, addressSaved };
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
