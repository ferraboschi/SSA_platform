import "server-only";

// Post-sync generator for the "registro crediti / trasferimenti".
//
// When a course is CANCELLED, the money already collected on its PAID seats is a
// deferred liability, not revenue. This step turns every such seat into an
// `aperto` credit so staff can later LINK it to the person's new enrolment and
// the money is recognised once, on the destination course's delivery.
//
// IDEMPOTENT: one credit per cancelled enrolment (UNIQUE iscrizione_origine_id),
// upserted with ON CONFLICT DO NOTHING — re-runs never duplicate and never
// clobber a staff-edited stato/destinazione.
//
// DEGRADES GRACEFULLY: if the corsi_crediti table (or any queried column) is
// missing (pre-migration), it returns { created: 0 } silently. It never throws
// into the sync.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { isPaidRevenue, netPaidCents } from "@/lib/economics/revenue";
import { generateCreditCode } from "./code";

export async function generateTransferCredits(): Promise<{ created: number }> {
  try {
    const svc = getSupabaseServiceClient();

    // Cancelled courses (the origin of every transfer credit). If the lifecycle
    // 'cancelled' value / column isn't there yet, this simply returns nothing.
    const { data: cancelledCourses, error: courseErr } = await svc
      .from("corsi")
      .select("id")
      .eq("lifecycle", "cancelled");
    if (courseErr) return { created: 0 }; // pre-migration / column missing → no-op
    const corsoIds = ((cancelledCourses ?? []) as { id: number }[]).map((c) => c.id);
    if (corsoIds.length === 0) return { created: 0 };

    // Paid, non-historical enrolments on those courses, with their net paid.
    // Select financial_status defensively: fall back to the base columns if the
    // enrichment migration hasn't been applied (then every seat counts as paid).
    const RICH = "id,corso_id,corsista_id,amount_cents,discount_cents,historical,financial_status";
    const BASE = "id,corso_id,corsista_id,amount_cents,discount_cents,historical";
    let select = RICH;
    let { data: iscr, error: iscrErr } = await svc
      .from("corsi_iscrizioni")
      .select(select)
      .in("corso_id", corsoIds);
    if (iscrErr && select === RICH) {
      select = BASE;
      ({ data: iscr, error: iscrErr } = await svc
        .from("corsi_iscrizioni")
        .select(select)
        .in("corso_id", corsoIds));
    }
    if (iscrErr) return { created: 0 };

    type IscrRow = {
      id: number;
      corso_id: number;
      corsista_id: number;
      amount_cents: number | null;
      discount_cents: number | null;
      historical?: boolean | null;
      financial_status?: string | null;
    };

    const rows: Array<{
      corsista_id: number;
      importo_cents: number;
      corso_origine_id: number;
      iscrizione_origine_id: number;
      stato: "aperto";
      codice: string;
    }> = [];
    for (const r of (iscr ?? []) as unknown as IscrRow[]) {
      if (r.historical) continue; // historical seats are already delivered/settled
      if (!isPaidRevenue(r.financial_status)) continue; // only money actually collected
      const net = netPaidCents(r);
      if (net <= 0) continue; // free/transferred seats carry no credit
      rows.push({
        corsista_id: r.corsista_id,
        importo_cents: net,
        corso_origine_id: r.corso_id,
        iscrizione_origine_id: r.id,
        stato: "aperto",
        // One-time redemption code, generated only on INSERT — the ignoreDuplicates
        // upsert leaves an already-issued code untouched on re-runs.
        codice: generateCreditCode(),
      });
    }
    if (rows.length === 0) return { created: 0 };

    // UPSERT keyed on the unique origin enrolment: ignoreDuplicates keeps a
    // re-run from re-inserting or overwriting a staff-edited row. `count` is the
    // number of NEW rows Postgres actually inserted.
    const { error: upErr, count } = await svc
      .from("corsi_crediti")
      .upsert(rows, {
        onConflict: "iscrizione_origine_id",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (upErr) return { created: 0 }; // table missing (pre-migration) → silent no-op

    return { created: count ?? 0 };
  } catch {
    // Any unexpected failure (missing table, transient error) must never break
    // the sync — the credit ledger simply stays as-is until the next run.
    return { created: 0 };
  }
}

/**
 * Auto-match redemption codes → close credits. When a person re-enrols on Shopify
 * using their credit's `codice` as the discount code, that enrolment's
 * discount_code equals the code; we then link the credit to the destination
 * enrolment and move it to "Utilizzati" (stato 'applicato'). Idempotent (only
 * touches still-open credits); never throws into the sync. Matching is by CODE
 * ALONE (the code identifies the credit even if a gifted/ceded access means the
 * redeemer differs from the original owner).
 */
export async function matchTransferCreditsByCode(): Promise<{ matched: number }> {
  try {
    const svc = getSupabaseServiceClient();

    // Open credits that carry a redemption code.
    const { data: credits, error: cErr } = await svc
      .from("corsi_crediti")
      .select("id, codice")
      .eq("stato", "aperto")
      .not("codice", "is", null);
    if (cErr) return { matched: 0 }; // pre-migration (no codice column) → no-op
    const byCode = new Map<string, number>();
    for (const c of (credits ?? []) as { id: number; codice: string | null }[]) {
      if (c.codice) byCode.set(c.codice, c.id);
    }
    if (byCode.size === 0) return { matched: 0 };

    // Enrolments whose Shopify discount code IS one of those redemption codes.
    const { data: enr, error: eErr } = await svc
      .from("corsi_iscrizioni")
      .select("id, corso_id, discount_code")
      .in("discount_code", [...byCode.keys()]);
    if (eErr) return { matched: 0 }; // discount_code column missing → no-op

    let matched = 0;
    for (const e of (enr ?? []) as { id: number; corso_id: number; discount_code: string | null }[]) {
      const creditId = e.discount_code ? byCode.get(e.discount_code) : undefined;
      if (creditId == null) continue;
      const { error } = await svc
        .from("corsi_crediti")
        .update({
          corso_destinazione_id: e.corso_id,
          iscrizione_destinazione_id: e.id,
          stato: "applicato",
          updated_at: new Date().toISOString(),
        })
        .eq("id", creditId)
        .eq("stato", "aperto"); // guard: only close a still-open credit
      if (!error) matched++;
    }
    return { matched };
  } catch {
    return { matched: 0 };
  }
}
