// Pure order-level rules for the Shopify sync. A LEAF module (no imports, no
// server-only) so the money-critical logic is unit-testable in isolation:
//
//  • dead-order detection — which orders must STOP counting as revenue;
//  • order-level discount proration — how one discount splits across lines.

/** Shopify financial statuses that mean "the money is gone". */
export const DEAD_FINANCIAL = new Set(["refunded", "voided"]);

/** The minimal order shape the dead-order rule needs (AdminOrder satisfies it). */
export interface OrderDeathFields {
  cancelled_at: string | null;
  financial_status: string | null;
}

/**
 * The `financial_status` to stamp on a dead order's enrollment rows, or null
 * when the order is alive. refunded/voided keep their real Shopify status; an
 * order cancelled WITHOUT a refund status gets "cancelled" — any non-"paid"
 * value is excluded by `isPaidRevenue`, so the seats stop counting as revenue
 * while the rows themselves survive (roster history — mai buttare dati).
 */
export function deadOrderStatus(o: OrderDeathFields): string | null {
  const fin = (o.financial_status || "").toLowerCase();
  if (DEAD_FINANCIAL.has(fin)) return fin;
  if (o.cancelled_at) return "cancelled";
  return null;
}

/** True when an order is cancelled, refunded or voided — it must contribute
 *  ZERO revenue and never insert new purchases/enrollments. */
export function isDeadOrder(o: OrderDeathFields): boolean {
  return deadOrderStatus(o) != null;
}

/**
 * Prorate an ORDER-level discount across its lines, proportional to each
 * line's gross value (price×qty, in cents). Integer cents only: each line gets
 * the floor of its exact share and the remainder goes to the LARGEST line, so
 * `sum(result) === discountCents` exactly (no cent is lost or invented).
 *
 * Edge behaviour: with no positive-value lines the whole discount lands on the
 * first line; a discount larger than the order total is still distributed in
 * full (per-line nets are clamped at 0 downstream by `netPaidCents`).
 */
export function prorateDiscount(
  lineGrossCents: number[],
  discountCents: number,
): number[] {
  const n = lineGrossCents.length;
  if (n === 0) return [];
  const discount = Math.max(0, Math.round(discountCents) || 0);
  const gross = lineGrossCents.map((g) => {
    const v = Math.round(g);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const total = gross.reduce((s, g) => s + g, 0);
  const shares = gross.map((g) =>
    total > 0 ? Math.floor((discount * g) / total) : 0,
  );
  let largest = 0;
  for (let i = 1; i < n; i++) if (gross[i] > gross[largest]) largest = i;
  shares[largest] += discount - shares.reduce((s, x) => s + x, 0);
  return shares;
}
