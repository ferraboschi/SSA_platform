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
 *  filtered by the query). Only the corsista id is needed here. */
export interface PurchaseTicketRow {
  corsista_id: number;
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
  corsista:
    | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean }
    | { full_name: string; email: string; phone: string | null; has_whatsapp: boolean }[]
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
 *  from purchases matched on the course product title. Replicates the L693-701
 *  loop exactly — a map from corsista id → ticket count.
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
    ticketCount.set(p.corsista_id, (ticketCount.get(p.corsista_id) ?? 0) + 1);
  }
  return ticketCount;
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
  const students: Student[] = enrollJoinRows.map((r) => {
    if (r.exam_result) examResults[r.exam_result]++;
    const c = Array.isArray(r.corsista) ? r.corsista[0] : r.corsista;
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
    const tickets = ticketByCorsista.get(r.corsista_id) ?? 1;
    return {
      name: participant,
      email: c?.email ?? "",
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
      iscrizioneId: r.id,
      companions: companionsByIscr.get(r.id) ?? [],
      hasWhatsApp: c?.has_whatsapp ?? false,
      nameMismatch: mismatch,
      registrationName: mismatch ? buyer : null,
    };
  });
  return { students, revenue, examResults };
}

// ── Catalog aggregation (coursesRepo.list) ───────────────────────────────────

/** Aggregate enrolled headcount + collected revenue per course from the paginated
 *  enrollment rollup. Replicates the L898-905 loop exactly: `n` counts EVERY
 *  enrollment (enrolled ≠ collected); `rev` adds netPaidEuros(row) only for
 *  isPaidRevenue rows. Returns a map corso id → { n, rev }. */
export function aggregateCourseEnrollments(
  enrollAggRows: EnrollmentAggRow[],
): Map<number, { n: number; rev: number }> {
  const agg = new Map<number, { n: number; rev: number }>();
  for (const i of enrollAggRows) {
    const a = agg.get(i.corso_id) ?? { n: 0, rev: 0 };
    a.n++; // headcount = all enrollments (enrolled ≠ collected)
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
