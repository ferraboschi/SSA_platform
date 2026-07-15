"use server";

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { verifyConfirmToken, isConfirmLinkSpent } from "./confirm-token";
import { normEmail, isValidEmail, normAddress, normDeliveryNotes } from "./confirm-normalize";
import { loadConfirmSubject } from "./confirm";
import { addressHasCivico } from "./civico";

export interface ConfirmAttendeeInput {
  /** Editable full name — lets the attendee fix a typo in their own name. */
  name: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  /** The written confirmation: "Confermo di aver inserito anche il numero civico". */
  addressConfirmed: boolean;
  /** "Ho controllato e confermo la correttezza di queste informazioni" — a gate,
   *  not stored. */
  dataConfirmed: boolean;
  /** GDPR consents (one checkbox sets both; stored in two columns). */
  privacyConsent: boolean;
  termsAccepted: boolean;
  /** OPTIONAL: citofono name if different from the surname, courier notes. */
  deliveryNotes?: string;
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
  const { c, k, i, ch, ia } = res.payload;
  const svc = getSupabaseServiceClient();

  const subject = await loadConfirmSubject(c, k, i);
  if (!subject) return { ok: false, error: "Destinatario non trovato." };
  // SPENT-LINK rule: after a completed confirmation this link is closed — only
  // a deliberate re-send (fresh token) re-opens the form. Enforced here too so
  // a stale page can't POST around the closed screen.
  if (isConfirmLinkSpent(subject.confirmedAt, ia)) {
    return { ok: false, error: "Questo link è già stato utilizzato. Chiedi all'educator di reinviartelo." };
  }

  // EMAIL — mandatory. On the "email" channel the client value is IGNORED: the
  // address the link was delivered to is authoritative (server-side lock).
  let clean = normEmail(input.email ?? "");
  if (ch === "email") {
    clean = normEmail(subject.email);
  }
  if (!isValidEmail(clean)) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }

  // NAME — mandatory (editable so the attendee can fix a typo; propagated below).
  const fullName = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (!fullName) return { ok: false, error: "Inserisci nome e cognome." };
  if (fullName.length > 120) return { ok: false, error: "Nome troppo lungo." };

  // PHONE — mandatory (propagated below).
  const phone = String(input.phone ?? "").trim();
  if (!phone) return { ok: false, error: "Inserisci il numero di telefono." };
  if (phone.length > 40) return { ok: false, error: "Numero di telefono troppo lungo." };

  // ADDRESS — mandatory + explicit written confirmation.
  const addr = normAddress(input.deliveryAddress);
  if (!addr.ok) return { ok: false, error: addr.error };
  if (!addr.value) return { ok: false, error: "Inserisci l'indirizzo di consegna." };
  if (!input.addressConfirmed) {
    return { ok: false, error: "Aggiungi il numero civico all'indirizzo per permetterci la consegna." };
  }
  // REAL check, not self-certification (owner batch 7/8): the STREET segment
  // must carry a number (postal codes never count — the old any-digit check
  // passed addresses without one), or the Italian "SNC".
  if (!addressHasCivico(addr.value)) {
    return {
      ok: false,
      error: 'Nell\'indirizzo manca il numero civico (es. "Via Roma 12"). Aggiungilo per permetterci la consegna.',
    };
  }

  // DATA-CORRECTNESS gate (checkbox only, not stored) — enforced server-side too
  // so a stale page can't POST around it.
  if (!input.dataConfirmed) {
    return { ok: false, error: "Spunta la casella di conferma della correttezza dei dati." };
  }

  // GDPR CONSENT — Privacy Policy + Terms & Conditions. Mandatory; recorded (with
  // a timestamp) in two columns below.
  if (!input.privacyConsent || !input.termsAccepted) {
    return { ok: false, error: "Per proseguire accetta la Privacy Policy e i Termini e Condizioni." };
  }

  // DELIVERY NOTES — optional (citofono name if different, courier notes).
  const notes = normDeliveryNotes(input.deliveryNotes);
  if (!notes.ok) return { ok: false, error: notes.error };

  const now = new Date().toISOString();
  const table = k === "corsista" ? "corsi_iscrizioni" : "corsi_partecipanti";
  const base =
    k === "corsista"
      ? { enrolled_email: clean, email_confirmed_at: now }
      : { email: clean, email_confirmed_at: now };
  const consent = { privacy_consent_at: now, terms_accepted_at: now };
  const withAddr = { ...base, delivery_address: addr.value, delivery_notes: notes.value };
  const full = { ...withAddr, ...consent };

  const doUpdate = (payload: Record<string, unknown>) =>
    svc.from(table).update(payload).eq("id", Number(i)).eq("corso_id", Number(c));

  // Try the full payload; degrade progressively if the optional columns aren't in
  // the DB yet (consent migration, then delivery migration), so the primary email
  // confirmation always lands. Track what actually saved.
  let addressSaved = true;
  let { error } = await doUpdate(full);
  if (error && /privacy_consent_at|terms_accepted_at/i.test(error.message)) {
    // Consent columns absent → keep the delivery fields, drop consent.
    ({ error } = await doUpdate(withAddr));
  }
  if (error && /delivery_address|delivery_notes|column/i.test(error.message)) {
    addressSaved = false;
    ({ error } = await doUpdate(base));
  }
  if (error) {
    return { ok: false, error: "Salvataggio non riuscito (migrazione non applicata?)." };
  }

  // NAME + PHONE propagation: corsista → the GLOBAL corsisti row (everywhere the
  // name/number appears); companion → its own row. Best-effort: a hiccup here
  // must not undo the email confirmation above.
  if (k === "corsista") {
    const { data: enr } = await svc
      .from("corsi_iscrizioni")
      .select("corsista_id")
      .eq("id", Number(i))
      .maybeSingle();
    const corsistaId = (enr as { corsista_id: number } | null)?.corsista_id;
    if (corsistaId != null) {
      await svc.from("corsisti").update({ full_name: fullName, phone }).eq("id", corsistaId);
    }
  } else {
    await svc
      .from("corsi_partecipanti")
      .update({ full_name: fullName, phone })
      .eq("id", Number(i))
      .eq("corso_id", Number(c));
  }

  return { ok: true, addressSaved };
}
