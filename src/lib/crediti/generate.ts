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
// SHOPIFY: for each NEW credit (one that did not exist before this run) the
// credit's `codice` is also created as a real one-time, fixed-amount Shopify
// discount code via the GraphQL Admin API, so it is live at checkout. This is
// gated on the token holding the `write_discounts` scope (resolved once per run)
// and is per-discount best-effort: any failure keeps the local code and stores a
// NULL shopify_discount_id — never a throw. Only NEW enrolments trigger a create,
// so re-runs never re-create a discount.
//
// DEGRADES GRACEFULLY: if the corsi_crediti table (or any queried column) is
// missing (pre-migration), it returns { created: 0 } silently. It never throws
// into the sync.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { isPaidRevenue, netPaidCents } from "@/lib/economics/revenue";
import {
  createBasicCodeDiscount,
  getGrantedScopes,
} from "@/lib/integrations/shopify/admin-client";
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

    // ── Candidate paid, non-historical enrolments (net > 0) on cancelled courses.
    const candidates: Array<{ corsista_id: number; net: number; corso_id: number; id: number }> = [];
    for (const r of (iscr ?? []) as unknown as IscrRow[]) {
      if (r.historical) continue; // historical seats are already delivered/settled
      if (!isPaidRevenue(r.financial_status)) continue; // only money actually collected
      const net = netPaidCents(r);
      if (net <= 0) continue; // free/transferred seats carry no credit
      candidates.push({ corsista_id: r.corsista_id, net, corso_id: r.corso_id, id: r.id });
    }
    if (candidates.length === 0) return { created: 0 };

    // ── NEW-only: which of these enrolments do NOT already have a credit? This is
    // what keeps a Shopify discount from being (re)created on every sync — a
    // discount is created ONLY for a genuinely new credit, never re-issued.
    const { data: existing, error: existErr } = await svc
      .from("corsi_crediti")
      .select("iscrizione_origine_id")
      .in("iscrizione_origine_id", candidates.map((c) => c.id));
    if (existErr) return { created: 0 }; // table missing (pre-migration) → silent no-op
    const hasCredit = new Set<number>(
      ((existing ?? []) as { iscrizione_origine_id: number | null }[])
        .map((e) => e.iscrizione_origine_id)
        .filter((v): v is number => v != null),
    );
    const fresh = candidates.filter((c) => !hasCredit.has(c.id));
    if (fresh.length === 0) return { created: 0 };

    // ── Resolve Shopify capability ONCE per run: only create discounts if the
    // token actually holds write_discounts. Any failure → treat as incapable
    // (local codes only), never throw.
    const canCreate = (await getGrantedScopes().catch(() => [] as string[])).includes(
      "write_discounts",
    );

    const rows: Array<{
      corsista_id: number;
      importo_cents: number;
      corso_origine_id: number;
      iscrizione_origine_id: number;
      stato: "aperto";
      codice: string;
      shopify_discount_id: string | null;
    }> = [];
    for (const c of fresh) {
      // One-time redemption code, generated only for a NEW credit.
      const codice = generateCreditCode();
      let shopify_discount_id: string | null = null;
      if (canCreate) {
        try {
          const d = await createBasicCodeDiscount({
            code: codice,
            amountEuros: c.net / 100,
            title: "Credito SSA — corso annullato",
            usageLimit: 1,
          });
          shopify_discount_id = d.id;
        } catch {
          // Keep the local code; leave shopify_discount_id null. NEVER throw.
        }
      }
      rows.push({
        corsista_id: c.corsista_id,
        importo_cents: c.net,
        corso_origine_id: c.corso_id,
        iscrizione_origine_id: c.id,
        stato: "aperto",
        codice,
        shopify_discount_id,
      });
    }

    // UPSERT keyed on the unique origin enrolment: ignoreDuplicates is the DB
    // backstop against a race (a credit inserted between the NEW-only read and
    // this write). `count` is the number of NEW rows Postgres actually inserted.
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
