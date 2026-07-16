// Pagamenti register — pure helpers (no imports beyond the revenue leaf) so the
// KPI math is unit-testable and shared verbatim by server mapper and client.

import { isPaidRevenue } from "@/lib/economics/revenue";

/** One Shopify order LINE, serialized for the client. Purchases row ids are
 *  unstable across re-syncs (delete+reinsert per order), so no id is carried —
 *  keying is only valid within a single render. */
export interface PaymentRow {
  orderName: string | null;
  externalId: string; // Shopify order id — the grouping key for "N° ordini"
  orderedAt: string | null; // ISO timestamp
  buyerName: string | null;
  buyerEmail: string | null;
  corsistaId: number | null;
  productTitle: string;
  cluster: string; // 'corso' | 'evento' | 'libro' | 'merchandise' | 'altro'
  subtype: string | null;
  quantity: number;
  grossCents: number;
  discountCents: number;
  /** Per-line net = max(gross − discount, 0). Assumes discount_cents is
   *  prorated per line — multi-line orders synced before the proration fix
   *  duplicate the ORDER-level discount on every line (a re-sync rewrites it). */
  netCents: number;
  financialStatus: string | null;
  courseHandle: string | null;
}

/** Display classification of Shopify's `financial_status` for one line.
 *  NOTE: "none" (null status = legacy pre-enrichment rows) still COUNTS as
 *  collected revenue (see `isPaidRevenue`) — it only renders as a neutral
 *  badge because the paid state was never actually recorded. */
export type PaymentStatusKind = "paid" | "pending" | "refunded" | "none";

export function paymentStatusKind(
  financialStatus: string | null | undefined,
): PaymentStatusKind {
  if (financialStatus == null) return "none";
  if (financialStatus === "paid") return "paid";
  if (financialStatus === "refunded" || financialStatus === "voided")
    return "refunded";
  // pending, authorized, partially_paid, partially_refunded, …
  return "pending";
}

export interface PaymentsSummary {
  /** Paid-only net (isPaidRevenue), all time. */
  totalPaidCents: number;
  /** Paid-only net with ordered_at inside the current calendar month. */
  monthPaidCents: number;
  /** Net of pending-ish lines (not paid/null, not refunded/voided). */
  pendingCents: number;
  /** Distinct Shopify order ids. */
  orderCount: number;
}

export function summarizePayments(
  rows: PaymentRow[],
  now: Date = new Date(),
): PaymentsSummary {
  const y = now.getFullYear();
  const m = now.getMonth();
  let totalPaidCents = 0;
  let monthPaidCents = 0;
  let pendingCents = 0;
  const orders = new Set<string>();

  for (const r of rows) {
    if (r.externalId) orders.add(r.externalId);
    if (isPaidRevenue(r.financialStatus)) {
      totalPaidCents += r.netCents;
      if (r.orderedAt) {
        const d = new Date(r.orderedAt);
        if (!Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m) {
          monthPaidCents += r.netCents;
        }
      }
    } else if (paymentStatusKind(r.financialStatus) === "pending") {
      pendingCents += r.netCents;
    }
  }

  return { totalPaidCents, monthPaidCents, pendingCents, orderCount: orders.size };
}
