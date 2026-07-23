"use server";

// Per-student removal from a LIVE course (owner: "se uno studente non può
// presentarsi, deve essere rimosso"). Two outcomes:
//   • rimborso — the money is refunded MANUALLY in Shopify (we only record the
//     removal + point staff at the order to refund); no credit.
//   • credito  — a corsi_crediti row is created (redeemable on a SAME-LEVEL
//     course via a Shopify code); staff re-open the freed seat in Shopify.
//
// The enrollment is NOT deleted: it's marked `annullata_at`/`annullata_tipo` so
// the order/amount trace survives for audit and to key the credit's origin. The
// pure aggregations exclude annullata seats from the roster + collected revenue.
//
// CAPACITY stays authoritative on Shopify: this action never seats anyone — a
// credit is redeemed by BUYING the new course on Shopify with the code, so the
// room can't be overfilled. Freeing the origin seat is a manual Shopify step
// (reminder + link), matching the owner's "link, not API" choice.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import { netPaidCents, isPaidRevenue } from "@/lib/economics/revenue";
import { createCreditForEnrollment } from "@/lib/crediti/generate";
import { shopifyAdminProductsUrl, shopifyAdminOrdersUrl } from "@/lib/integrations/shopify/admin-url";

export interface CancelEnrollmentResult {
  ok: boolean;
  error?: string;
  schema?: boolean;
  /** A credit was created (credito mode) — the name now shows in /crediti. */
  credited?: boolean;
  /** Reminder + deep-link for the manual Shopify step (re-open seat / refund). */
  reminder?: { text: string; url: string; label: string };
}

function isMissingSchema(err: { message?: string } | null | undefined): boolean {
  return !!err && /annullata|does not exist|schema cache|column|find the table/i.test(err.message || "");
}

export async function cancelEnrollmentAction(
  corsoId: number,
  iscrizioneId: number,
  mode: "credito" | "rimborso",
): Promise<CancelEnrollmentResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  const corso = Number(corsoId);
  const iscrId = Number(iscrizioneId);
  if (!Number.isInteger(corso) || corso <= 0) return { ok: false, error: "Corso non valido." };
  if (!Number.isInteger(iscrId) || iscrId <= 0) return { ok: false, error: "Iscrizione non valida." };
  if (mode !== "credito" && mode !== "rimborso") return { ok: false, error: "Modalità non valida." };

  try {
    const svc = getSupabaseServiceClient();

    // Load the enrollment (with its Shopify order fields) + the course (type,
    // list price, product id). The corsista must not be a placeholder — an empty
    // seat is removed via removeSeatAction, not cancelled.
    const { data: enr, error: enrErr } = await svc
      .from("corsi_iscrizioni")
      .select(
        "id, corso_id, corsista_id, amount_cents, discount_cents, financial_status, annullata_at, order_name, corsista:corsisti(full_name, placeholder), corso:corsi(id, type, price_cents, external_id, full_title)",
      )
      .eq("id", iscrId)
      .maybeSingle();
    if (enrErr) {
      if (isMissingSchema(enrErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: enrErr.message };
    }
    if (!enr || Number(enr.corso_id) !== corso) return { ok: false, error: "Iscrizione non valida per questo corso." };
    if (enr.annullata_at) return { ok: false, error: "Questa iscrizione è già stata annullata." };
    const cor = Array.isArray(enr.corsista) ? enr.corsista[0] : enr.corsista;
    if (cor?.placeholder) return { ok: false, error: "Un posto da completare si rimuove con «Rimuovi posto», non da qui." };
    const course = (Array.isArray(enr.corso) ? enr.corso[0] : enr.corso) as
      | { id: number; type: string | null; price_cents: number | null; external_id: string | null; full_title: string | null }
      | null;

    // ── CREDITO: create the credit FIRST (so we never remove the seat without its
    // compensation), then mark the seat annullata. Intro = the course LIST price
    // ("un posto introduttivo", regardless of what was paid — even €0); higher
    // levels = the net actually paid.
    let credited = false;
    if (mode === "credito") {
      const isIntro = (course?.type ?? "") === "introduttivo";
      const net = netPaidCents({ amount_cents: enr.amount_cents, discount_cents: enr.discount_cents });
      const importoCents = isIntro ? Math.max(net, course?.price_cents ?? 0) : net;
      // A non-intro seat that collected nothing has no value to credit.
      if (!isIntro && (importoCents <= 0 || !isPaidRevenue(enr.financial_status))) {
        return { ok: false, error: "Nessun importo incassato da convertire in credito. Usa il rimborso o verifica il pagamento." };
      }
      const cr = await createCreditForEnrollment(svc, {
        corsistaId: Number(enr.corsista_id),
        corsoOrigineId: corso,
        iscrizioneOrigineId: iscrId,
        importoCents,
        tipoOrigine: course?.type ?? null,
      });
      if (!cr.ok) {
        if (isMissingSchema({ message: cr.error })) return { ok: false, schema: true, error: "Registro crediti non disponibile (migrazione mancante)." };
        return { ok: false, error: cr.error || "Creazione credito non riuscita." };
      }
      credited = cr.created;
    }

    // Mark the seat annullata (kept for audit; excluded from roster + revenue).
    const { error: updErr } = await svc
      .from("corsi_iscrizioni")
      .update({ annullata_at: new Date().toISOString(), annullata_tipo: mode })
      .eq("id", iscrId);
    if (updErr) {
      if (isMissingSchema(updErr)) return { ok: false, schema: true, error: "Funzione non disponibile (migrazione mancante)." };
      return { ok: false, error: updErr.message };
    }

    revalidatePath(`/corsi/${corso}`);
    revalidatePath("/crediti");

    // Reminder + deep-link for the manual Shopify step the platform deliberately
    // does NOT automate (owner's "link, not API" choice).
    const reminder =
      mode === "credito"
        ? {
            text: "Il credito è registrato. Il posto NON si libera da solo: riapri un posto su Shopify (inventario +1) per questo corso.",
            url: shopifyAdminProductsUrl(course?.full_title ?? undefined),
            label: "Apri il corso su Shopify",
          }
        : {
            text: "Ricordati di effettuare il rimborso su Shopify: aprilo dall'ordine e rimborsa (con restock, così il posto si libera).",
            url: shopifyAdminOrdersUrl(enr.order_name ?? undefined),
            label: "Apri l'ordine su Shopify",
          };

    return { ok: true, credited, reminder };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Operazione non riuscita." };
  }
}
