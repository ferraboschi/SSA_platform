// ============================================================================
// Revenue rule — the SINGLE SOURCE OF TRUTH for "money actually collected".
//
// This is a PURE LEAF module: it imports NOTHING (no data layer, no domain, no
// server-only) so it can be used from anywhere — server code, mappers, alert
// checks, credit generation, and unit tests alike.
//
// Two rules used to be copy-pasted across ~7 call sites:
//
//   1. NET PAID = gross − discount, clamped at 0.
//      `amount_cents` is the gross line price; `discount_cents` is the discount
//      value applied to it. A 100%-off code (free re-participation) yields a
//      net of 0 rather than a negative number.
//
//   2. isPaidRevenue — revenue counts only fully-collected orders. Shopify's
//      `financial_status` of "paid" is the sole revenue-bearing state; pending,
//      authorized, partially_paid, partially_refunded (and refunded/voided,
//      which the sync already drops) are all excluded. A null status (legacy /
//      pre-enrichment rows) is treated as PAID so historical revenue is not
//      silently zeroed.
// ============================================================================

/** Net paid, in CENTS: gross (`amount_cents`) − discount (`discount_cents`),
 *  clamped at 0. Missing/null fields count as 0. */
export function netPaidCents(row: {
  amount_cents?: number | null;
  discount_cents?: number | null;
}): number {
  return Math.max((row.amount_cents || 0) - (row.discount_cents || 0), 0);
}

/** Net paid, in EUROS: {@link netPaidCents} / 100. No rounding applied here —
 *  callers round at their own display/aggregation boundary, exactly as before. */
export function netPaidEuros(row: {
  amount_cents?: number | null;
  discount_cents?: number | null;
}): number {
  return netPaidCents(row) / 100;
}

/** Whether an enrollment's Shopify `financial_status` counts as collected
 *  revenue. "paid" is the only revenue-bearing state; a null/undefined status
 *  (legacy / pre-enrichment rows) is treated as paid so historical revenue is
 *  not silently zeroed. Everything else (pending, partially_paid, refunded, …)
 *  is excluded. */
export function isPaidRevenue(
  financialStatus: string | null | undefined,
): boolean {
  return financialStatus == null || financialStatus === "paid";
}
