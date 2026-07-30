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
import { isPaidRevenue, netPaidCents } from "@/lib/economics/revenue";

type CreditoStato = "aperto" | "applicato" | "rimborsato" | "annullato";

/** Link an OPEN credit to a destination enrolment (typically a 100%-off
 *  re-enrolment). The credit becomes 'applicato' and is recognised as revenue on
 *  the destination course only once it's DELIVERED (mapper gates on "passato").
 *  The destination enrolment MUST exist AND belong to corsoDestinazioneId — the
 *  client ids are validated, never trusted. */
export async function linkCreditoAction(
  creditoId: number,
  corsoDestinazioneId: number,
  iscrizioneDestinazioneId: number,
): Promise<void> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();

  // Validate the destination enrolment exists AND belongs to the destination
  // course — reject a mismatched/forged pair before writing anything.
  const { data: iscr, error: iscrErr } = await svc
    .from("corsi_iscrizioni")
    .select("id,corso_id,amount_cents,discount_cents,financial_status")
    .eq("id", iscrizioneDestinazioneId)
    .maybeSingle();
  if (iscrErr) throw iscrErr;
  const dest = iscr as
    | { corso_id: number; amount_cents: number | null; discount_cents: number | null; financial_status: string | null }
    | null;
  if (!dest || dest.corso_id !== corsoDestinazioneId) {
    throw new Error("Iscrizione di destinazione non valida.");
  }

  // The credit is RECOGNISED as revenue on the destination course. That is only
  // correct when the credit was actually SPENT there (applied as a discount so
  // the seat's own net is reduced). Linking it to a seat paid in FULL with NO
  // discount would recognise the credit ON TOP of the full price → double count.
  // Block that unambiguous case; partial redemptions (a discount is present) and
  // full redemptions (net 0) are allowed.
  if (
    isPaidRevenue(dest.financial_status) &&
    netPaidCents({ amount_cents: dest.amount_cents, discount_cents: dest.discount_cents }) > 0 &&
    (dest.discount_cents ?? 0) <= 0
  ) {
    throw new Error(
      "Questo posto è stato pagato per intero senza sconto: il credito non risulta speso qui. Applica prima il codice credito su Shopify (o scegli il posto giusto), così non si conta due volte.",
    );
  }

  // SAME-LEVEL only (owner): a credit is redeemable on a course of the same
  // `type` as the one it came from. Compare origin vs destination level; skip the
  // check only if the type column can't be read (pre-migration safety).
  const { data: credito } = await svc
    .from("corsi_crediti")
    .select("corso_origine_id")
    .eq("id", creditoId)
    .maybeSingle();
  const origineId = (credito as { corso_origine_id: number | null } | null)?.corso_origine_id ?? null;
  if (origineId != null) {
    const { data: courses, error: tErr } = await svc
      .from("corsi")
      .select("id,type")
      .in("id", [origineId, corsoDestinazioneId]);
    if (!tErr && courses) {
      const byId = new Map((courses as { id: number; type: string | null }[]).map((c) => [c.id, c.type]));
      const tOrig = byId.get(origineId);
      const tDest = byId.get(corsoDestinazioneId);
      if (tOrig && tDest && tOrig !== tDest) {
        throw new Error("Il credito si può riassegnare solo a un corso dello stesso livello.");
      }
    }
  }

  const { error } = await svc
    .from("corsi_crediti")
    .update({
      corso_destinazione_id: corsoDestinazioneId,
      iscrizione_destinazione_id: iscrizioneDestinazioneId,
      stato: "applicato",
      updated_at: new Date().toISOString(),
    })
    .eq("id", creditoId);
  if (error) throw error;

  revalidatePath("/crediti");
  revalidatePath(`/corsi/${corsoDestinazioneId}`);
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
