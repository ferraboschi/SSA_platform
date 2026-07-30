"use server";

// Server actions for the "registro crediti / trasferimenti". Role-guarded
// (admin/manager) and defensive: client-supplied ids are never trusted — every
// destination is re-validated against the DB before it's written.
//
// All actions degrade gracefully: a Supabase error (e.g. the corsi_crediti table
// missing pre-migration) surfaces as a thrown Error the client catches and rolls
// back its optimistic UI; nothing else in the app is affected.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { assertRole } from "@/lib/auth/guard";
import { shopifyAdminProductsUrl } from "@/lib/integrations/shopify/admin-url";

type CreditoStato = "aperto" | "applicato" | "rimborsato" | "annullato";

export interface SpendCreditResult {
  ok: boolean;
  error?: string;
  /** A brand-new (or revived) off-Shopify seat was created for the person → the
   *  operator must close a seat on Shopify so inventory stays aligned. */
  reminder?: { text: string; url: string; label: string };
}

/**
 * Spend an OPEN credit on a same-level destination course (owner's model: the
 * value follows the PERSON). You choose only the COURSE — the credit's own
 * corsista is placed on it:
 *   • already enrolled (active) there → reuse that seat;
 *   • has a removed (annullata) seat there → revive it;
 *   • not there → create an off-Shopify seat, IF capacity allows.
 * The seat carries €0 (revenue is recognised via the credit on the delivered
 * course, counted once). Capacity is enforced against the course's Shopify-seeded
 * `capacity`; a newly-occupied seat returns a "close a seat on Shopify" reminder
 * (the platform never writes Shopify inventory itself). Client ids are validated.
 */
export async function spendCreditOnCourseAction(
  creditoId: number,
  corsoDestinazioneId: number,
): Promise<SpendCreditResult> {
  await assertRole(["admin", "manager"]);
  try {
    const svc = getSupabaseServiceClient();

    const { data: credRow, error: credErr } = await svc
      .from("corsi_crediti")
      .select("id,corsista_id,corso_origine_id,stato")
      .eq("id", creditoId)
      .maybeSingle();
    if (credErr) throw credErr;
    const credito = credRow as
      | { corsista_id: number; corso_origine_id: number | null; stato: string }
      | null;
    if (!credito) return { ok: false, error: "Credito non trovato." };
    if (credito.stato !== "aperto") return { ok: false, error: "Questo credito non è più disponibile." };

    // Destination course: level (same-level guard) + capacity + title (reminder).
    const { data: destRow, error: destErr } = await svc
      .from("corsi")
      .select("id,type,capacity,full_title")
      .eq("id", corsoDestinazioneId)
      .maybeSingle();
    if (destErr) throw destErr;
    const dest = destRow as
      | { id: number; type: string | null; capacity: number | null; full_title: string | null }
      | null;
    if (!dest) return { ok: false, error: "Corso di destinazione inesistente." };

    // SAME LEVEL only (owner): shochu↔shochu, certificato↔certificato, intro↔intro.
    if (credito.corso_origine_id != null) {
      const { data: orig } = await svc
        .from("corsi")
        .select("type")
        .eq("id", credito.corso_origine_id)
        .maybeSingle();
      const tOrig = (orig as { type: string | null } | null)?.type ?? null;
      if (tOrig && dest.type && tOrig !== dest.type) {
        return { ok: false, error: "Il credito si può usare solo su un corso dello stesso livello." };
      }
    }

    // The person's existing seat on this course (active first, else a revivable
    // removed one). Never trust the client — derive from the credit's corsista.
    const { data: seatRows } = await svc
      .from("corsi_iscrizioni")
      .select("id,annullata_at")
      .eq("corso_id", corsoDestinazioneId)
      .eq("corsista_id", credito.corsista_id);
    const seats = (seatRows ?? []) as { id: number; annullata_at: string | null }[];
    const active = seats.find((s) => !s.annullata_at);
    const revivable = seats.find((s) => s.annullata_at);

    let iscrizioneId: number;
    let reminder: SpendCreditResult["reminder"];

    if (active) {
      // Already on the course (e.g. re-bought on Shopify with the credit code) →
      // just attach the credit to that seat. No new seat, no capacity change.
      iscrizioneId = active.id;
    } else {
      // A new seat will be OCCUPIED → enforce capacity (Shopify-seeded max).
      const { count } = await svc
        .from("corsi_iscrizioni")
        .select("id", { count: "exact", head: true })
        .eq("corso_id", corsoDestinazioneId)
        .is("annullata_at", null);
      const enrolled = count ?? 0;
      const cap = dest.capacity ?? 0;
      if (cap > 0 && enrolled >= cap) {
        return {
          ok: false,
          error: `Corso pieno: ${enrolled}/${cap} posti occupati. Libera un posto (o aumenta la capienza su Shopify) prima di usare il credito qui.`,
        };
      }

      if (revivable) {
        const { error: upErr } = await svc
          .from("corsi_iscrizioni")
          .update({ annullata_at: null, annullata_tipo: null, amount_cents: 0, discount_cents: 0 })
          .eq("id", revivable.id);
        if (upErr) throw upErr;
        iscrizioneId = revivable.id;
      } else {
        const { data: ins, error: insErr } = await svc
          .from("corsi_iscrizioni")
          .insert({
            corso_id: corsoDestinazioneId,
            corsista_id: credito.corsista_id,
            amount_cents: 0,
            discount_cents: 0,
            historical: false,
            seat_index: 1,
          })
          .select("id")
          .maybeSingle();
        if (insErr) throw insErr;
        if (!ins?.id) return { ok: false, error: "Creazione del posto non riuscita." };
        iscrizioneId = Number(ins.id);
      }

      // A seat is now occupied off-Shopify → remind staff to close one on Shopify.
      reminder = {
        text: "Posto aggiunto col credito. Il posto NON si chiude da solo su Shopify: riduci l'inventario di 1 per questo corso, così non viene rivenduto.",
        url: shopifyAdminProductsUrl(dest.full_title ?? undefined),
        label: "Apri il corso su Shopify",
      };
    }

    const { error: linkErr } = await svc
      .from("corsi_crediti")
      .update({
        corso_destinazione_id: corsoDestinazioneId,
        iscrizione_destinazione_id: iscrizioneId,
        stato: "applicato",
        updated_at: new Date().toISOString(),
      })
      .eq("id", creditoId);
    if (linkErr) throw linkErr;

    revalidatePath("/crediti");
    revalidatePath(`/corsi/${corsoDestinazioneId}`);
    return { ok: true, reminder };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Operazione non riuscita." };
  }
}

/** Change a credit's state. Allowed transitions here:
 *   • 'rimborsato' — money refunded to the person (out of the deferred ledger)
 *   • 'annullato'  — voided (e.g. false positive)
 *   • 'aperto'     — unlink; the credit returns to the pool
 *  Moving AWAY from 'applicato' clears the destination link so the applied
 *  revenue is no longer recognised on that course. */
export async function setCreditoStatoAction(
  creditoId: number,
  stato: "rimborsato" | "annullato" | "aperto",
): Promise<void> {
  await assertRole(["admin", "manager"]);
  if (!["rimborsato", "annullato", "aperto"].includes(stato)) {
    throw new Error("Stato non valido.");
  }
  const svc = getSupabaseServiceClient();

  // Read the current destination (for revalidation) before clearing it.
  const { data: current } = await svc
    .from("corsi_crediti")
    .select("corso_destinazione_id")
    .eq("id", creditoId)
    .maybeSingle();
  const priorDest = (current as { corso_destinazione_id: number | null } | null)
    ?.corso_destinazione_id ?? null;

  // Leaving 'applicato' → unlink the destination so revenue stops being
  // recognised there.
  const patch: {
    stato: CreditoStato;
    updated_at: string;
    corso_destinazione_id: null;
    iscrizione_destinazione_id: null;
  } = {
    stato,
    updated_at: new Date().toISOString(),
    corso_destinazione_id: null,
    iscrizione_destinazione_id: null,
  };

  const { error } = await svc
    .from("corsi_crediti")
    .update(patch)
    .eq("id", creditoId);
  if (error) throw error;

  revalidatePath("/crediti");
  if (priorDest != null) revalidatePath(`/corsi/${priorDest}`);
}
