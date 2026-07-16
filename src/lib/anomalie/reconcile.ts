import "server-only";

// Lightweight reconciliation pass, run at the end of every Shopify pull.
//
// It re-computes the COUNTS of the four anomalie reconciliation rules and logs
// a single one-line summary. This is the "runs every time data is pulled from
// Shopify" surface; the anomalie PAGE recomputes the same rules live on view.
//
// CONTRACT:
//  • NON-THROWING — every query is guarded so a missing table/column (an env
//    that hasn't run the Phase 1–3 migrations yet) degrades that rule's count
//    to 0. logReconciliation() itself never throws into the sync.
//  • COUNTS ONLY — no names, emails, ids or amounts are logged (no PII).
//
// The counts are the LENGTHS of the exact same arrays the anomalie PAGE renders:
// both call the shared pure algorithms in src/lib/anomalie/rules.ts, so there is
// ONE source of truth — this file no longer re-derives the predicates.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { paginateAll } from "@/lib/data/supabase/query-helpers";
import {
  missingCompanions,
  fullDiscountCancelled,
  cashOnCancelled,
  type EnrRow as RuleEnrRow,
  type CorsoLite,
  type PurchaseCorsoRow,
  type PartecipanteRow,
} from "@/lib/anomalie/rules";

interface EnrRow {
  id: number;
  corsista_id: number;
  corso_id: number;
  amount_cents: number | null;
  discount_cents: number | null;
  financial_status?: string | null;
}

/** Fetch every row of a table via keyset paging; returns [] on any error. */
async function loadAll<T>(
  sb: ReturnType<typeof getSupabaseServiceClient>,
  table: string,
  columns: string,
): Promise<T[]> {
  return paginateAll<T>(
    async (from, to) => {
      const { data, error } = await sb.from(table).select(columns).range(from, to);
      return { data: data as T[] | null, error };
    },
    { onError: "break" },
  );
}

export interface ReconciliationCounts {
  doppioNo2nd: number;
  cancelled100off: number;
  cashOnCancelled: number;
  openCredits: number;
}

/** settings_kv key holding the last computed counts (read by the shell for
 *  the /anomalie nav badge — a single cheap row instead of a recompute). */
export const ANOMALIE_COUNTS_KEY = "anomalie_counts";

/**
 * Compute the four reconciliation counts. Each rule is independently guarded so
 * a missing table degrades that count to 0; never throws.
 */
export async function computeReconciliation(): Promise<ReconciliationCounts> {
  const counts: ReconciliationCounts = {
    doppioNo2nd: 0,
    cancelled100off: 0,
    cashOnCancelled: 0,
    openCredits: 0,
  };

  const sb = getSupabaseServiceClient();

  // Shared reads (base columns only → safe pre-enrichment). Only `full_title`
  // and `lifecycle` drive the shared rules; the other CorsoLite fields don't
  // affect any of these three counts, so they're filled with null.
  const corsi = await loadAll<{
    id: number;
    full_title: string | null;
    lifecycle: string | null;
  }>(sb, "corsi", "id,full_title,lifecycle");
  const corsoById = new Map<number, CorsoLite>(
    corsi.map((c) => [
      c.id,
      {
        id: c.id,
        short_title: null,
        full_title: c.full_title,
        type: "",
        delivery_mode: null,
        month: null,
        year: null,
        city: null,
        lifecycle: c.lifecycle,
      },
    ]),
  );
  // The shared rules build human labels off a name map; counts don't depend on
  // it, so an empty map is fine (rules fall back to `#id`).
  const corsistaName = new Map<number, string>();

  // financial_status is optional (pre-enrichment). Try the rich select; on
  // error fall back to the base columns and treat every seat as paid.
  let enr = await loadAll<EnrRow>(
    sb,
    "corsi_iscrizioni",
    "id,corsista_id,corso_id,amount_cents,discount_cents,financial_status",
  );
  if (enr.length === 0) {
    enr = await loadAll<EnrRow>(
      sb,
      "corsi_iscrizioni",
      "id,corsista_id,corso_id,amount_cents,discount_cents",
    );
  }
  const ruleEnr = enr as RuleEnrRow[];

  // ── Rule 1: doppio-no-2nd ──────────────────────────────────────────────
  try {
    const purchases = await paginateAll<PurchaseCorsoRow>(async (from, to) => {
      const { data, error } = await sb
        .from("purchases")
        .select("corsista_id,product_title")
        .eq("cluster", "corso")
        .range(from, to);
      return { data: (data ?? []) as PurchaseCorsoRow[], error };
    });
    // corsi_partecipanti missing → the throw propagates and degrades this to 0.
    const partecipanti = await paginateAll<PartecipanteRow>(async (from, to) => {
      const { data, error } = await sb
        .from("corsi_partecipanti")
        .select("iscrizione_id")
        .range(from, to);
      return { data: (data ?? []) as PartecipanteRow[], error };
    });
    counts.doppioNo2nd = missingCompanions(
      ruleEnr,
      corsoById,
      corsistaName,
      purchases,
      partecipanti,
    ).length;
  } catch {
    counts.doppioNo2nd = 0;
  }

  // ── Rule 2: cancelled-100off ───────────────────────────────────────────
  try {
    counts.cancelled100off = fullDiscountCancelled(ruleEnr, corsoById, corsistaName).length;
  } catch {
    counts.cancelled100off = 0;
  }

  // ── Rule 3: cash-on-cancelled ──────────────────────────────────────────
  try {
    const creditedIscr = new Set<number>();
    const { data: cred, error: credErr } = await sb
      .from("corsi_crediti")
      .select("iscrizione_origine_id");
    // Missing table → empty set → best-effort flags all paid-on-cancelled.
    if (!credErr) {
      for (const r of (cred ?? []) as { iscrizione_origine_id: number | null }[]) {
        if (r.iscrizione_origine_id != null) creditedIscr.add(r.iscrizione_origine_id);
      }
    }
    counts.cashOnCancelled = cashOnCancelled(
      ruleEnr,
      corsoById,
      corsistaName,
      creditedIscr,
    ).length;
  } catch {
    counts.cashOnCancelled = 0;
  }

  // ── Rule 4: open-credits ───────────────────────────────────────────────
  try {
    // Count only (head:true) — an exact server-side count is NOT capped by the
    // default ~1000 row limit, so the log stays correct at any scale (the page,
    // which needs the rows to render, uses the openCredits() rule instead).
    const { count, error } = await sb
      .from("corsi_crediti")
      .select("id", { count: "exact", head: true })
      .eq("stato", "aperto");
    if (error) throw error; // table/column missing → degrade to 0
    counts.openCredits = count ?? 0;
  } catch {
    counts.openCredits = 0;
  }

  return counts;
}

/**
 * Compute the counts and console.log a one-line summary. Wrapped so it can
 * NEVER break the sync; logs counts only (no PII).
 */
export async function logReconciliation(): Promise<void> {
  try {
    const c = await computeReconciliation();
    console.log(
      `[reconcile] doppio-no-2nd=${c.doppioNo2nd} cancelled-100off=${c.cancelled100off} ` +
        `cash-on-cancelled=${c.cashOnCancelled} open-credits=${c.openCredits}`,
    );
    // Persist the counts for the shell nav badge (counts only — no PII).
    try {
      const total = c.doppioNo2nd + c.cancelled100off + c.cashOnCancelled + c.openCredits;
      await getSupabaseServiceClient()
        .from("settings_kv")
        .upsert(
          {
            key: ANOMALIE_COUNTS_KEY,
            value: { computedAt: new Date().toISOString(), total, byRule: c },
          },
          { onConflict: "key" },
        );
    } catch {
      // Best-effort: the badge just stays stale until the next sync.
    }
  } catch {
    // Never let reconciliation logging break a Shopify sync.
  }
}
