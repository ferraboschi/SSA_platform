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
