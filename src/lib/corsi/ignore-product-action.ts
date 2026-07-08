"use server";

// Owner's "Ignora prodotto" flag (Bug 3): a Shopify product that is NOT a real
// course (bundle / package sale vehicle) gets flagged here — the sync will skip
// it forever (no ghost corso, no enrollments, no backfill) and the ghost corso
// row is removed. Only allowed when the corso has ZERO enrollments: a course
// with real people on it is clearly not a sale vehicle, refuse loudly.

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { addIgnoredProduct } from "@/lib/sync/ignored-products";
import { hasRole } from "@/lib/auth/guard";

export interface IgnoreProductResult {
  ok: boolean;
  error?: string;
}

export async function ignoreProductAction(corsoId: string): Promise<IgnoreProductResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };

  const id = Number(corsoId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Corso non valido." };

  try {
    const svc = getSupabaseServiceClient();
    const { data: corso, error } = await svc
      .from("corsi")
      .select("id, external_id, full_title")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!corso) return { ok: false, error: "Corso non trovato." };
    if (!corso.external_id) {
      return { ok: false, error: "Questo corso non è collegato a un prodotto Shopify." };
    }

    const { count } = await svc
      .from("corsi_iscrizioni")
      .select("*", { count: "exact", head: true })
      .eq("corso_id", id);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `Il corso ha ${count} iscrizioni: non può essere ignorato. Rimuovile prima, oppure contattami se è un errore.`,
      };
    }

    // Flag the product first (so even a failed delete leaves the sync skipping
    // it), then remove the ghost corso row.
    await addIgnoredProduct(svc, String(corso.external_id), (corso.full_title as string) ?? "");
    const { error: delErr } = await svc.from("corsi").delete().eq("id", id);
    if (delErr) return { ok: false, error: delErr.message };

    revalidatePath("/corsi");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Operazione non riuscita." };
  }
}
