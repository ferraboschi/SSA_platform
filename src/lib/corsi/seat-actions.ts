"use server";

// INTERNAL (authenticated) multi-ticket SEAT management (F4).
//
// A quantity=N course line is materialized as N enrollment rows: seat 1 = the
// buyer (full amount), seats 2..N = PLACEHOLDER corsisti ("Posto N — da
// completare", €0). Revenue lives entirely on seat 1, so seats 2..N never touch
// the money math. These actions let staff:
//   - completeSeatAction  → turn a placeholder seat into a real person (name +
//     optional email/phone); the person then becomes a normal corsista and gets
//     exam links via the ordinary corsista path.
//   - addExtraSeatAction  → add a standalone extra seat "fuori ordine" (a walk-in
//     not tied to any Shopify order), as a new placeholder to complete.
//   - removeSeatAction    → drop a placeholder seat (and its synthetic corsista).
//     Only placeholder, €0 seats can be removed — never a real/paid enrollment.
//
// Role-guarded (admin/manager). The corso_id is always re-derived from the
// loaded enrollment; the client pairing is never trusted. Degrades gracefully
// (schema flag) until the seat migration is applied.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import { placeholderName } from "@/lib/sync/seats";
import { sortedNameKey } from "@/lib/anomalie/rules";

export interface SeatActionResult {
  ok: boolean;
  error?: string;
  schema?: boolean;
  /** completeSeatAction: the seat was LINKED to an existing corsista (a repeat
   *  attendee) rather than promoting the placeholder to a new person. */
  linked?: boolean;
}

function isMissingSchema(err: { message?: string } | null | undefined): boolean {
  return (
    !!err &&
    /seat_index|placeholder|does not exist|schema cache|find the table|column/i.test(err.message || "")
  );
}

/** Fill a placeholder seat with a real person. Name required; email/phone
 *  optional (email lets them take the exam / receive results later). If the email
 *  already belongs to another corsista, the seat is RE-POINTED to that existing
 *  person and the synthetic placeholder is removed — unless they are already
 *  enrolled on this course (which would duplicate the enrollment). */
export async function completeSeatAction(
  corsoId: number,
  iscrizioneId: number,
  person: { name: string; email?: string; phone?: string },
): Promise<SeatActionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };

  const corso = Number(corsoId);
  const iscrId = Number(iscrizioneId);
  if (!Number.isInteger(corso) || corso <= 0) return { ok: false, error: "Corso non valido." };
  if (!Number.isInteger(iscrId) || iscrId <= 0) return { ok: false, error: "Iscrizione non valida." };

  // ALL FOUR data points are mandatory: first + last name, email, phone.
  const name = String(person?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Nome obbligatorio." };
  if (name.split(" ").length < 2) return { ok: false, error: "Inserisci nome e cognome." };
  if (name.length > 120) return { ok: false, error: "Nome troppo lungo." };
  const email = String(person?.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Inserisci un'email valida." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email non valida." };
  if (email.length > 200) return { ok: false, error: "Email troppo lunga." };
  const phone = String(person?.phone ?? "").trim();
  if (!phone) return { ok: false, error: "Inserisci il numero di telefono." };
  if (phone.length > 40) return { ok: false, error: "Telefono troppo lungo." };

  try {
    const svc = getSupabaseServiceClient();

    // The seat must exist, belong to this course, and be a placeholder.
    const { data: enr, error: enrErr } = await svc
      .from("corsi_iscrizioni")
      .select("id, corso_id, corsista_id, corsista:corsisti(id, placeholder)")
      .eq("id", iscrId)
      .maybeSingle();
    if (enrErr) {
      if (isMissingSchema(enrErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: enrErr.message };
    }
    if (!enr || Number(enr.corso_id) !== corso) return { ok: false, error: "Iscrizione non valida per questo corso." };
    const cor = Array.isArray(enr.corsista) ? enr.corsista[0] : enr.corsista;
    if (!cor?.placeholder) return { ok: false, error: "Questo posto è già assegnato a una persona." };
    const placeholderId = Number(enr.corsista_id);

    // Does this email already belong to (other) corsisti? Duplicates can exist,
    // so fetch the set — not a single row.
    const { data: existingRows } = await svc
      .from("corsisti")
      .select("id, full_name")
      .eq("email", email)
      .neq("id", placeholderId)
      .limit(20);
    const existing = (existingRows ?? []) as { id: number; full_name: string | null }[];

    if (existing.length > 0) {
      // Owner's rule: an already-present email is NOT a problem when it's the SAME
      // person attending again — we add this course as a new participation on their
      // existing profile, never a duplicate. It IS a conflict only when the name
      // genuinely differs (likely a mistyped address). "Same person" uses the app's
      // own duplicate rule: order-insensitive, accent/case-insensitive name key.
      const nameKey = sortedNameKey(name);
      const samePerson = existing.find(
        (c) => nameKey.length > 0 && sortedNameKey(c.full_name ?? "") === nameKey,
      );
      if (!samePerson) {
        return { ok: false, error: "Mail già presente: è associata a un altro nominativo." };
      }
      // Repeat attendee across courses is fine; twice in THIS course is not.
      const { data: dupRows } = await svc
        .from("corsi_iscrizioni")
        .select("id")
        .eq("corso_id", corso)
        .eq("corsista_id", samePerson.id)
        .neq("id", iscrId)
        .limit(1);
      if (dupRows && dupRows.length > 0) {
        return { ok: false, error: "Questa persona è già presente in questo corso." };
      }
      // Link THIS seat to the existing profile (new participation) + drop the
      // now-unused placeholder corsista.
      const { error: linkErr } = await svc
        .from("corsi_iscrizioni")
        .update({ corsista_id: samePerson.id, enrolled_email: email })
        .eq("id", iscrId);
      if (linkErr) return { ok: false, error: linkErr.message };
      await svc.from("corsisti").delete().eq("id", placeholderId).then(
        () => {},
        () => {},
      );
      revalidatePath(`/corsi/${corso}`);
      return { ok: true, linked: true };
    }

    // New person → promote the placeholder corsista in place.
    const { error: updErr } = await svc
      .from("corsisti")
      .update({ full_name: name, email, phone, placeholder: false })
      .eq("id", placeholderId);
    if (updErr) return { ok: false, error: updErr.message };
    await svc.from("corsi_iscrizioni").update({ enrolled_email: email }).eq("id", iscrId);

    revalidatePath(`/corsi/${corso}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}

/** Add a standalone extra seat "fuori ordine" — a walk-in not tied to any
 *  Shopify order. Creates a fresh placeholder corsista + a €0 enrollment (no
 *  line_item_id), which the roster shows as a "da completare" row. */
export async function addExtraSeatAction(corsoId: number): Promise<SeatActionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };

  const corso = Number(corsoId);
  if (!Number.isInteger(corso) || corso <= 0) return { ok: false, error: "Corso non valido." };

  try {
    const svc = getSupabaseServiceClient();
    // The course must exist (avoid orphan seats on a bad id).
    const { data: c, error: cErr } = await svc.from("corsi").select("id").eq("id", corso).maybeSingle();
    if (cErr) return { ok: false, error: cErr.message };
    if (!c) return { ok: false, error: "Corso inesistente." };

    // Fresh synthetic identity — a manual seat has no order/line to key on, so a
    // random suffix keeps the unique email collision-free.
    const email = `seat-extra-${corso}-${randomUUID()}@placeholder.ssa`;
    const { data: ph, error: phErr } = await svc
      .from("corsisti")
      .insert({ email, full_name: placeholderName(1), historical: false, placeholder: true })
      .select("id")
      .maybeSingle();
    if (phErr) {
      if (isMissingSchema(phErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: phErr.message };
    }
    if (!ph?.id) return { ok: false, error: "Creazione posto non riuscita." };

    const { error: insErr } = await svc.from("corsi_iscrizioni").insert({
      corso_id: corso,
      corsista_id: Number(ph.id),
      amount_cents: 0,
      historical: false,
      seat_index: 1,
    });
    if (insErr) {
      // Roll back the orphan placeholder if the seat insert failed.
      await svc.from("corsisti").delete().eq("id", Number(ph.id)).eq("placeholder", true);
      if (isMissingSchema(insErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: insErr.message };
    }

    revalidatePath(`/corsi/${corso}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Creazione non riuscita." };
  }
}

/** Remove a placeholder seat (and its synthetic corsista). Guarded: only a
 *  placeholder, €0 enrollment can be dropped — never a real or paid one. */
export async function removeSeatAction(
  corsoId: number,
  iscrizioneId: number,
): Promise<SeatActionResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };

  const corso = Number(corsoId);
  const iscrId = Number(iscrizioneId);
  if (!Number.isInteger(corso) || corso <= 0) return { ok: false, error: "Corso non valido." };
  if (!Number.isInteger(iscrId) || iscrId <= 0) return { ok: false, error: "Iscrizione non valida." };

  try {
    const svc = getSupabaseServiceClient();
    const { data: enr, error: enrErr } = await svc
      .from("corsi_iscrizioni")
      .select("id, corso_id, amount_cents, corsista_id, corsista:corsisti(id, placeholder)")
      .eq("id", iscrId)
      .maybeSingle();
    if (enrErr) {
      if (isMissingSchema(enrErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: enrErr.message };
    }
    if (!enr) return { ok: true }; // already gone — idempotent
    if (Number(enr.corso_id) !== corso) return { ok: false, error: "Iscrizione non valida per questo corso." };
    const cor = Array.isArray(enr.corsista) ? enr.corsista[0] : enr.corsista;
    if (!cor?.placeholder || Number(enr.amount_cents) !== 0) {
      return { ok: false, error: "Solo un posto non ancora assegnato può essere rimosso." };
    }

    const { error: delErr } = await svc.from("corsi_iscrizioni").delete().eq("id", iscrId);
    if (delErr) return { ok: false, error: delErr.message };
    // The synthetic placeholder existed only for this seat — remove it too.
    await svc.from("corsisti").delete().eq("id", Number(enr.corsista_id)).eq("placeholder", true);

    revalidatePath(`/corsi/${corso}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Eliminazione non riuscita." };
  }
}
