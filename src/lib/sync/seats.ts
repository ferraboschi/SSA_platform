// Pure seat-planning for multi-ticket course lines. A quantity=N line becomes N
// seats: seat 1 carries the FULL line amount, seats 2..N carry €0 ("included in
// order #…"). This keeps revenue IDENTICAL (sum of seat amounts = line amount)
// while headcount = number of rows. Owner decision (2026-07-04): all amount on
// seat 1, not split. Unit-tested — the revenue invariant must never drift.

export interface SeatPlan {
  seatIndex: number; // 1-based
  amountCents: number;
}

/** Plan the seats for one course line. `qty` clamps to >= 1. `totalAmountCents`
 *  is the whole line's collected amount; it all lands on seat 1. */
export function planSeats(qty: number, totalAmountCents: number): SeatPlan[] {
  const n = Math.max(1, Math.floor(qty) || 1);
  const total = Math.max(0, Math.round(totalAmountCents) || 0);
  return Array.from({ length: n }, (_, i) => ({
    seatIndex: i + 1,
    amountCents: i === 0 ? total : 0,
  }));
}

/** Deterministic synthetic email for a placeholder attendee, so a re-sync
 *  resolves the SAME corsista (idempotent) instead of creating duplicates. */
export function placeholderEmail(orderId: string | number, lineItemId: string | number, seatIndex: number): string {
  return `seat-${orderId}-${lineItemId}-${seatIndex}@placeholder.ssa`;
}

/** Human label for an unfilled seat. */
export function placeholderName(seatIndex: number): string {
  return `Posto ${seatIndex} — da completare`;
}

/** Deterministic synthetic email for the BUYER of an email-less Shopify order
 *  (manual / phone / POS): keyed by the order id so a re-sync resolves the same
 *  corsista. The `@ssa.placeholder` domain is already filtered out of the
 *  global search index (shell-data). */
export function orderPlaceholderEmail(orderId: string | number): string {
  return `order-${orderId}@ssa.placeholder`;
}
