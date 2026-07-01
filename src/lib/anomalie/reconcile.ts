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
// The rule predicates mirror src/app/(app)/anomalie/page.tsx exactly.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

const isPaidRevenue = (fs: string | null | undefined) => fs == null || fs === "paid";
const net = (amount: number | null, discount: number | null) =>
  Math.max((amount || 0) - (discount || 0), 0);

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
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

export interface ReconciliationCounts {
  doppioNo2nd: number;
  cancelled100off: number;
  cashOnCancelled: number;
  openCredits: number;
}

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

  // Shared reads (base columns only → safe pre-enrichment).
  const corsi = await loadAll<{
    id: number;
    full_title: string | null;
    lifecycle: string | null;
  }>(sb, "corsi", "id,full_title,lifecycle");
  const corsoById = new Map(corsi.map((c) => [c.id, c]));
  const isCancelled = (id: number) => corsoById.get(id)?.lifecycle === "cancelled";

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

  // ── Rule 1: doppio-no-2nd ──────────────────────────────────────────────
  try {
    const purByCorsistaTitle = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("purchases")
        .select("corsista_id,product_title")
        .eq("cluster", "corso")
        .range(from, from + 999);
      if (error) throw error;
      const rows = (data ?? []) as { corsista_id: number; product_title: string | null }[];
      for (const p of rows) {
        if (p.corsista_id == null || !p.product_title) continue;
        const k = `${p.corsista_id}|${p.product_title}`;
        purByCorsistaTitle.set(k, (purByCorsistaTitle.get(k) ?? 0) + 1);
      }
      if (rows.length < 1000) break;
    }
    const companionsByIscr = new Map<number, number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("corsi_partecipanti")
        .select("iscrizione_id")
        .range(from, from + 999);
      if (error) throw error; // corsi_partecipanti missing → degrade to 0
      const rows = (data ?? []) as { iscrizione_id: number | null }[];
      for (const p of rows) {
        if (p.iscrizione_id == null) continue;
        companionsByIscr.set(p.iscrizione_id, (companionsByIscr.get(p.iscrizione_id) ?? 0) + 1);
      }
      if (rows.length < 1000) break;
    }
    for (const e of enr) {
      const full = corsoById.get(e.corso_id)?.full_title;
      if (!full) continue;
      const bought = purByCorsistaTitle.get(`${e.corsista_id}|${full}`) ?? 0;
      if (bought < 2) continue;
      const have = companionsByIscr.get(e.id) ?? 0;
      if (bought - 1 - have > 0) counts.doppioNo2nd++;
    }
  } catch {
    counts.doppioNo2nd = 0;
  }

  // ── Rule 2: cancelled-100off ───────────────────────────────────────────
  try {
    for (const e of enr) {
      if ((e.discount_cents || 0) < (e.amount_cents || 0)) continue;
      const course = corsoById.get(e.corso_id);
      if (course && course.lifecycle !== "cancelled") continue; // valid course → skip
      counts.cancelled100off++;
    }
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
    for (const e of enr) {
      if (!isCancelled(e.corso_id)) continue;
      if (net(e.amount_cents, e.discount_cents) <= 0) continue;
      if (!isPaidRevenue(e.financial_status)) continue;
      if (creditedIscr.has(e.id)) continue;
      counts.cashOnCancelled++;
    }
  } catch {
    counts.cashOnCancelled = 0;
  }

  // ── Rule 4: open-credits ───────────────────────────────────────────────
  try {
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
  } catch {
    // Never let reconciliation logging break a Shopify sync.
  }
}
