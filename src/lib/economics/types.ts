// Per-course economics overlay — pure types, safe to import from client & server.
//
// Two dimensions owned by two roles:
//   • advCost  — campaign / ADV spend, entered by SOCIAL (Dario), course by course.
//   • invoiced — invoicing status, marked by ACCOUNTANT (Luigi).
// For admin/manager these render as a filled value or a grey "not yet" signal.

import type { CourseTypeKey } from "@/lib/domain";

export interface CourseEconomics {
  /** Campaign/ADV spend in euros. `null` = not yet filled (grey signal). */
  advCost: number | null;
  advBy: string | null;
  advAt: string | null;
  /** Invoicing marked done by accounting. */
  invoiced: boolean;
  invoicedBy: string | null;
  invoicedAt: string | null;
}

export const EMPTY_ECON: CourseEconomics = {
  advCost: null,
  advBy: null,
  advAt: null,
  invoiced: false,
  invoicedBy: null,
  invoicedAt: null,
};

/** One row of the Conto economico table (serializable view model). */
export interface EconCourseRow {
  id: string;
  title: string;
  type: CourseTypeKey;
  typeLabel: string;
  city: string;
  month: string;
  year: number;
  revenue: number;
  /** Course already held (lifecycle "passato") → eligible for invoicing. */
  ended: boolean;
  econ: CourseEconomics;
}

/** "Da fatturare" = held but not yet marked invoiced. */
export function isToInvoice(row: EconCourseRow): boolean {
  return row.ended && !row.econ.invoiced;
}

// ── Invoicing go-live ──────────────────────────────────────────────────────
// The Platform started owning invoicing in June 2026. Every course that ENDED
// before this was invoiced by hand → it's legacy and counts as already settled,
// so the dashboard and Conto economico don't surface 100+ historical "da
// fatturare" rows. This is a pure presentation cutoff: NO data is deleted or
// written. The first Platform-tracked invoice is the next course to end on/after
// go-live (the Vercelli course, Giugno 2026). Month is 0-based (matches
// monthIndexIt: Gennaio=0 … Giugno=5).
export const INVOICING_GO_LIVE = { year: 2026, month0: 5 } as const;

/**
 * True when a held course predates invoicing go-live, so it's treated as a
 * legacy invoice already settled (hand-done before the Platform took over).
 * `month0` is the 0-based month index (use monthIndexIt(course.month)).
 */
export function isLegacyInvoiced(year: number, month0: number, ended: boolean): boolean {
  if (!ended) return false;
  return year * 12 + month0 < INVOICING_GO_LIVE.year * 12 + INVOICING_GO_LIVE.month0;
}
