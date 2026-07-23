// ============================================================================
// Aggregations — PURE compute-from-rows for the courses reader.
//
// Extracted VERBATIM from ./index.ts (buildFullCourse + coursesRepo.list). None
// of these functions touch the Supabase client or do any IO: the adapter fetches
// the rows, hands them here, and maps the result to the domain. Keeping the money
// math here (unchanged) makes it testable and shrinks the adapter.
//
// Money conventions are inherited EXACTLY from the original inline code:
//   - the per-student `paid` is computed in EURO space (gross − discountValue),
//     deliberately NOT via netPaidEuros — Tier-1 kept it euro-space on purpose to
//     stay byte-identical (the cents-space helper rounds differently in the
//     sub-cent float). See the note on buildStudentsFromEnrollments.
//   - the list-level `rev` rollup DOES use netPaidEuros (cents-space) — matching
//     the original coursesRepo.list.
// Every money predicate routes through @/lib/economics/revenue (single source).
// ============================================================================

import type { CourseCompanion, Student } from "@/lib/domain";
import { isPaidRevenue, netPaidEuros } from "@/lib/economics/revenue";

// ── Input row shapes (plain PostgREST rows; no client, no IO) ────────────────

/** A purchases row as fetched for ticket counting (cluster/product_title already
 *  filtered by the query). `quantity` is the real Shopify seat count for the
 *  line (an order for two people = one row with quantity 2); it defaults to 1
 *  on a pre-quantity row. */
export interface PurchaseTicketRow {
  corsista_id: number;
  quantity?: number | null;
}

/** An enrollment joined to its corsista, as fetched by buildFullCourse. Mirrors
 *  the local `IscrJoin` shape in index.ts exactly. */
export interface EnrollmentJoinRow {
  id: number;
  corsista_id: number;
  amount_cents: number;
  exam_result: "passed" | "retrial" | "failed" | null;
  order_name: string | null;
  order_date: string | null;
  discount_code: string | null;
  discount_cents: number | null;
  financial_status: string | null;
  line_item_id: number | null;
  buyer_name: string | null;
  /** Confirmed-email snapshot (course-start /conferma flow) — preferred over
   *  corsisti.email everywhere else it's resolved (share-links/load.ts,
   *  exam-send-actions.ts); absent on a pre-migration DB. */
  enrolled_email?: string | null;
  /** Staff override of the inferred seat count (NULL/absent = use inferred).
   *  Absent on a pre-migration DB → falls back to the inferred count. */
  seats_override?: number | null;
  /** Multi-ticket seat position within the order line (F4). 1 = buyer; 2..N =
   *  the extra seats materialized as their own rows. Absent pre-migration → 1. */
  seat_index?: number | null;
  /** Set when the student was removed from the course (refund/credit). Such a
   *  seat leaves the roster + collected revenue. Absent pre-migration → active. */
  annullata_at?: string | null;
  corsista:
    | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean; placeholder?: boolean }
    | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean; placeholder?: boolean }[]
    | null;
}

/** An enrollment row as fetched by the paginated catalog rollup in
 *  coursesRepo.list. `financial_status` is optional (may be absent pre-migration,
 *  in which case isPaidRevenue treats it as paid). */
export interface EnrollmentAggRow {
  corso_id: number;
  amount_cents: number;
  discount_cents: number | null;
  financial_status?: string | null;
  /** Removed-from-course seat (refund/credit) — excluded from headcount + revenue.
   *  Absent pre-migration → counts as active. */
  annullata_at?: string | null;
}

/** A corsi_crediti row scoped to a single destination course (already filtered on
 *  corso_destinazione_id + stato in the query). */
export interface CreditImportRow {
  importo_cents: number | null;
}

/** A corsi_crediti row across all destination courses (filtered on stato only). */
export interface CreditByCourseRow {
  corso_destinazione_id: number | null;
  importo_cents: number | null;
}

// ── Per-course aggregations (buildFullCourse) ────────────────────────────────

/** Duplicate detection ("doppio"): how many course tickets each person holds,
 *  from purchases matched on the course product title — a map from corsista id
 *  → seat count. SUMS `quantity` (default 1), not the row count: a single
 *  order line paying for two people is ONE purchases row with quantity 2, and
 *  counting rows would read it as one ticket (the bug this fixes). Multiple
 *  separate order rows still sum correctly.
 *
 *  The `courseFullTitle` parameter documents that the caller has already filtered
 *  the purchase rows on `product_title === courseFullTitle` (and cluster "corso")
 *  in the query; every passed-in row is counted. */
export function countTicketsByCorsista(
  purchaseRows: PurchaseTicketRow[],
  courseFullTitle: string,
): Map<number, number> {
  void courseFullTitle;
  const ticketCount = new Map<number, number>();
  for (const p of purchaseRows) {
    const qty = Number.isFinite(Number(p.quantity)) && Number(p.quantity) > 0 ? Math.trunc(Number(p.quantity)) : 1;
    ticketCount.set(p.corsista_id, (ticketCount.get(p.corsista_id) ?? 0) + qty);
  }
  return ticketCount;
}

/** Multi-ticket reconciliation (F4). A single order line for N people is now
 *  materialized as N enrollment rows (seat 1 = buyer, seats 2..N = placeholders),
 *  so a line_item_id that appears on MORE THAN ONE row is "expanded": its extra
 *  seats already exist as real rows. For those lines the LEGACY seat inference
 *  (purchases.quantity → tickets, and the "da compilare" companion slots) must be
 *  suppressed, or the buyer would show "2 posti" AND a separate "Posto 2" row —
 *  double-counting the same seat. Returns the set of expanded line_item_ids.
 *
 *  A line with a single row is NOT expanded (genuine single-ticket, or a
 *  pre-migration DB where seats were never split) → the legacy inference stands,
 *  so nothing regresses. */
export function expandedLineItemIds(
  rows: Pick<EnrollmentJoinRow, "line_item_id">[],
): Set<number> {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.line_item_id == null) continue;
    counts.set(r.line_item_id, (counts.get(r.line_item_id) ?? 0) + 1);
  }
  const expanded = new Set<number>();
  for (const [lineId, n] of counts) if (n > 1) expanded.add(lineId);
  return expanded;
}

/** Result of the roster build: the Student[] plus the paid-only revenue sum and
 *  the exam-result tally — the three things buildFullCourse derives from the
 *  enrollment rows in one pass. */
export interface StudentRosterResult {
  students: Student[];
  revenue: number;
  examResults: { passed: number; retrial: number; failed: number };
}

/** Build the course roster from enrollment-join rows. Replicates the L729-773
 *  mapping EXACTLY:
 *   - `paid` is EURO space: Math.max(gross − discountValue, 0), where gross and
 *     discountValue are each `*_cents / 100`. This is DELIBERATELY not
 *     netPaidEuros — keep it byte-identical (see module header).
 *   - revenue sums `paid` only for isPaidRevenue rows (collected only).
 *   - nameMismatch / registrationName / buyerName / isDuplicate / tickets /
 *     ticketCode / paymentStatus are set as in the original.
 *   - each student's `companions` come from `companionsByIscr` keyed on the
 *     enrollment id (empty array when none).
 *   - the exam-result tally increments as each row is visited (row order). */
export function buildStudentsFromEnrollments(
  enrollJoinRows: EnrollmentJoinRow[],
  ticketByCorsista: Map<number, number>,
  companionsByIscr: Map<number, CourseCompanion[]>,
): StudentRosterResult {
  let revenue = 0;
  const examResults = { passed: 0, retrial: 0, failed: 0 };
  // A student removed from the course (refund/credit) leaves the roster and the
  // collected revenue — but the row is kept in the DB for audit. Drop it here so
  // every course-detail reader (roster, revenue, exam tally) sees only active seats.
  const activeRows = enrollJoinRows.filter((r) => !r.annullata_at);
  // Lines whose extra seats are already materialized as their own rows (F4): the
  // legacy seat inference is suppressed for them (see expandedLineItemIds).
  const expanded = expandedLineItemIds(activeRows);
  const students: Student[] = activeRows.map((r) => {
    if (r.exam_result) examResults[r.exam_result]++;
    const c = Array.isArray(r.corsista) ? r.corsista[0] : r.corsista;
    const isPlaceholder = Boolean(c?.placeholder);
    const seatIndex = r.seat_index != null && r.seat_index >= 1 ? Math.trunc(r.seat_index) : 1;
    const lineExpanded = r.line_item_id != null && expanded.has(r.line_item_id);
    // amount_cents is the gross line price; discount_cents is the discount
    // value. Net paid = gross − discount (clamped at 0 for 100%-off codes).
    // NOTE: this site subtracts in EURO space (gross/discountValue are shown
    // separately in the roster), so the net is derived from them directly to
    // stay byte-identical — the cents-space helper (netPaidEuros) rounds
    // differently in the sub-cent float. Same clamped rule, different order.
    const gross = (r.amount_cents || 0) / 100;
    const discountValue = (r.discount_cents || 0) / 100;
    const paid = Math.max(gross - discountValue, 0);
    // Revenue = collected: only fully-paid orders contribute. The roster below
    // still lists unpaid enrollments (with their amount + paymentStatus).
    if (isPaidRevenue(r.financial_status)) revenue += paid;
    const participant = c?.full_name ?? "—";
    const buyer = r.buyer_name;
    const mismatch = Boolean(
      buyer && buyer.trim().toLowerCase() !== participant.trim().toLowerCase(),
    );
    // Seat count: staff override wins over the inferred count (sum of
    // purchases.quantity). `ticketsInferred` keeps the automatic value so the
    // roster can show "auto: N" and offer a reset.
    //
    // F4: on an EXPANDED line each seat is its own row, so this row = exactly one
    // seat — force tickets to 1 (no "doppio" badge, no "da compilare" slots) or
    // the buyer would double with the materialized "Posto N" rows. Un-expanded
    // lines (single-ticket / pre-migration) keep the legacy inference untouched.
    const ticketsInferred = lineExpanded ? 1 : (ticketByCorsista.get(r.corsista_id) ?? 1);
    const override = !lineExpanded && r.seats_override != null && r.seats_override >= 1 ? Math.trunc(r.seats_override) : null;
    const tickets = override ?? ticketsInferred;
    // The confirmed enrolled_email snapshot is the current, verified address
    // (set via /conferma) — prefer it exactly like the educator share page and
    // the exam-invite sender already do; corsisti.email (Shopify identity) is
    // only the fallback for a student who never confirmed.
    const resolvedEmail = (r.enrolled_email ?? "").trim() || (c?.email ?? "");
    return {
      name: participant,
      email: resolvedEmail,
      phone: c?.phone ?? "",
      orderNumber: r.order_name ?? "",
      orderDate: r.order_date ?? "",
      amount: paid,
      grossAmount: gross,
      discountCode: r.discount_code,
      discountValue,
      paymentStatus: r.financial_status,
      ticketCode: r.line_item_id != null ? String(r.line_item_id) : null,
      buyerName: buyer,
      isDuplicate: tickets > 1,
      tickets,
      ticketsInferred,
      iscrizioneId: r.id,
      companions: companionsByIscr.get(r.id) ?? [],
      hasWhatsApp: c?.has_whatsapp ?? false,
      nameMismatch: isPlaceholder ? false : mismatch,
      registrationName: isPlaceholder ? null : mismatch ? buyer : null,
      examResult: r.exam_result,
      placeholder: isPlaceholder,
      seatIndex,
    };
  });
  // Keep an order line's seats together and in seat order (buyer, then Posto 2…)
  // so a completed/placeholder seat sits directly under its buyer. Rows without a
  // line (manual / pre-migration) keep their first-appearance order at the end of
  // their natural position — a stable sort preserves relative order for equal keys.
  const orderOf = new Map<number, number>();
  students.forEach((s, i) => {
    const line = s.ticketCode != null ? Number(s.ticketCode) : NaN;
    if (Number.isFinite(line) && !orderOf.has(line)) orderOf.set(line, i);
  });
  const stable = students.map((s, i) => ({ s, i }));
  stable.sort((a, b) => {
    const la = a.s.ticketCode != null ? Number(a.s.ticketCode) : NaN;
    const lb = b.s.ticketCode != null ? Number(b.s.ticketCode) : NaN;
    const ga = Number.isFinite(la) ? (orderOf.get(la) ?? a.i) : a.i;
    const gb = Number.isFinite(lb) ? (orderOf.get(lb) ?? b.i) : b.i;
    if (ga !== gb) return ga - gb; // group lines by first appearance
    const sa = a.s.seatIndex ?? 1;
    const sb = b.s.seatIndex ?? 1;
    if (sa !== sb) return sa - sb; // within a line, buyer first
    return a.i - b.i; // otherwise stable
  });
  return { students: stable.map((x) => x.s), revenue, examResults };
}

// ── Catalog aggregation (coursesRepo.list) ───────────────────────────────────

/** Aggregate enrolled headcount + collected revenue per course from the paginated
 *  enrollment rollup. Replicates the L898-905 loop exactly: `n` counts EVERY
 *  enrollment (enrolled ≠ collected); `rev` adds netPaidEuros(row) only for
 *  isPaidRevenue rows. Returns a map corso id → { n, rev }. */
/** Statuses of a seat whose money is gone (refunded/voided) or whose order was
 *  cancelled — kept in the roster for history, but NOT proof a course ran. */
const DEAD_ENROLLMENT = new Set(["refunded", "voided", "cancelled"]);

export function aggregateCourseEnrollments(
  enrollAggRows: EnrollmentAggRow[],
): Map<number, { n: number; nLive: number; rev: number }> {
  const agg = new Map<number, { n: number; nLive: number; rev: number }>();
  for (const i of enrollAggRows) {
    if (i.annullata_at) continue; // removed-from-course seat: not enrolled, no revenue
    const a = agg.get(i.corso_id) ?? { n: 0, nLive: 0, rev: 0 };
    a.n++; // headcount = all enrollments (enrolled ≠ collected)
    // Live seats exclude dead orders — deriveLifecycle uses this so a fully
    // refunded, back-to-draft course is never resurrected as "held".
    if (!DEAD_ENROLLMENT.has((i.financial_status ?? "").toLowerCase())) a.nLive++;
    // Net paid = gross − discount, never negative. Revenue counts only
    // fully-paid orders.
    if (isPaidRevenue(i.financial_status)) a.rev += netPaidEuros(i);
    agg.set(i.corso_id, a);
  }
  return agg;
}

// ── Applied transfer credits ─────────────────────────────────────────────────

/** Sum the transfer credits APPLIED to a SINGLE destination course, in euros.
 *  The caller has already filtered the rows on corso_destinazione_id + stato
 *  "applicato"; this replicates the L829-833 reduce (sum importo_cents, / 100). */
export function sumAppliedCreditsForCourse(
  credRows: CreditImportRow[],
): number {
  return (
    credRows.reduce((s, c) => s + (c.importo_cents || 0), 0) / 100
  );
}

/** Group the transfer credits APPLIED across all destination courses into a map
 *  corso id → summed importo_cents (CENTS, matching the original — the caller
 *  divides by 100 at the mapping boundary). Replicates the L921-932 loop: rows
 *  with a null corso_destinazione_id are skipped. The caller has already filtered
 *  on stato "applicato" (and a non-null destination) in the query. */
export function groupAppliedCreditsByCourse(
  credRows: CreditByCourseRow[],
): Map<number, number> {
  const creditsByCourse = new Map<number, number>();
  for (const c of credRows) {
    if (c.corso_destinazione_id == null) continue;
    creditsByCourse.set(
      c.corso_destinazione_id,
      (creditsByCourse.get(c.corso_destinazione_id) ?? 0) + (c.importo_cents || 0),
    );
  }
  return creditsByCourse;
}
