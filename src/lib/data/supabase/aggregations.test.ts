import { describe, it, expect } from "vitest";
import type { CourseCompanion } from "@/lib/domain";
import {
  aggregateCourseEnrollments,
  buildStudentsFromEnrollments,
  countTicketsByCorsista,
  expandedLineItemIds,
  groupAppliedCreditsByCourse,
  sumAppliedCreditsForCourse,
  type EnrollmentAggRow,
  type EnrollmentJoinRow,
} from "./aggregations";

// A fully-specified enrollment-join row; individual tests override just the
// fields they exercise so the intent of each case stays legible.
function enroll(overrides: Partial<EnrollmentJoinRow> = {}): EnrollmentJoinRow {
  const base: EnrollmentJoinRow = {
    id: 1,
    corsista_id: 100,
    amount_cents: 12000,
    exam_result: null,
    order_name: "#1001",
    order_date: "2026-03-01",
    discount_code: null,
    discount_cents: null,
    financial_status: "paid",
    line_item_id: 55,
    buyer_name: null,
    corsista: {
      full_name: "Alice Rossi",
      email: "alice@example.com",
      phone: "+39 333",
      has_whatsapp: true,
    },
  };
  const merged = { ...base, ...overrides };
  // Each enrollment is its own Shopify order line: unless a test pins
  // line_item_id explicitly, derive a DISTINCT one per id so multi-row cases
  // aren't accidentally read as one "expanded" multi-ticket line (F4).
  if (!("line_item_id" in overrides)) merged.line_item_id = 5500 + merged.id;
  return merged;
}

describe("countTicketsByCorsista", () => {
  it("counts a single ticket per corsista", () => {
    const map = countTicketsByCorsista(
      [{ corsista_id: 100 }],
      "Corso Certificato Milano",
    );
    expect(map.get(100)).toBe(1);
    expect(map.size).toBe(1);
  });

  it("counts two line items for the same corsista as tickets=2 (a doppio)", () => {
    const map = countTicketsByCorsista(
      [{ corsista_id: 100 }, { corsista_id: 100 }, { corsista_id: 200 }],
      "Corso Certificato Milano",
    );
    expect(map.get(100)).toBe(2);
    expect(map.get(200)).toBe(1);
  });

  it("counts every passed-in row (title match is the caller's query filter)", () => {
    // The rows handed in have already been filtered on product_title by the
    // query; the function counts them all regardless of the title argument.
    const map = countTicketsByCorsista([], "Corso Che Non Combacia");
    expect(map.size).toBe(0);
  });

  it("SUMS quantity: one order line for two people (quantity=2) counts as 2 seats", () => {
    // The bug this fixes: a single qty=2 line is ONE row; counting rows read it
    // as 1 ticket and hid the second person. Summing quantity catches it.
    const map = countTicketsByCorsista(
      [{ corsista_id: 100, quantity: 2 }, { corsista_id: 200, quantity: 1 }],
      "Corso Certificato Milano",
    );
    expect(map.get(100)).toBe(2);
    expect(map.get(200)).toBe(1);
  });

  it("mixes quantity and multiple rows correctly", () => {
    const map = countTicketsByCorsista(
      [{ corsista_id: 100, quantity: 2 }, { corsista_id: 100, quantity: 1 }],
      "Corso Certificato Milano",
    );
    expect(map.get(100)).toBe(3); // one qty-2 line + one qty-1 line
  });

  it("treats missing/invalid quantity as 1 (pre-quantity row)", () => {
    const map = countTicketsByCorsista(
      [{ corsista_id: 100 }, { corsista_id: 100, quantity: null }, { corsista_id: 100, quantity: 0 }],
      "Corso Certificato Milano",
    );
    expect(map.get(100)).toBe(3); // each malformed row counts as 1
  });
});

describe("buildStudentsFromEnrollments", () => {
  const noTickets = new Map<number, number>();
  const noCompanions = new Map<number, CourseCompanion[]>();

  it("builds a paid seat: euro-space net, counts into revenue", () => {
    const { students, revenue } = buildStudentsFromEnrollments(
      [enroll({ amount_cents: 12000, discount_cents: null, financial_status: "paid" })],
      noTickets,
      noCompanions,
    );
    expect(students).toHaveLength(1);
    expect(students[0].amount).toBe(120);
    expect(students[0].grossAmount).toBe(120);
    expect(students[0].discountValue).toBe(0);
    expect(revenue).toBe(120);
  });

  it("a 100%-off seat gives paid 0 (clamped), still listed", () => {
    const { students, revenue } = buildStudentsFromEnrollments(
      [
        enroll({
          amount_cents: 12000,
          discount_cents: 15000, // discount exceeds gross → clamp at 0
          discount_code: "FREE",
          financial_status: "paid",
        }),
      ],
      noTickets,
      noCompanions,
    );
    expect(students[0].amount).toBe(0);
    expect(students[0].discountValue).toBe(150);
    expect(students[0].discountCode).toBe("FREE");
    expect(revenue).toBe(0);
  });

  it("preserves the euro-space net (gross − discountValue), NOT the cents-space helper", () => {
    // At sub-cent boundaries the two spaces DIVERGE in IEEE-754:
    //   euro-space:  3/100 − 1/100 = 0.019999999999999997
    //   cents-space: (3 − 1)/100    = 0.02
    // The roster path derives `paid` from the two euro values by design (Tier-1
    // kept it euro-space to stay byte-identical) — so this actually pins that
    // choice: swapping the per-student net to netPaidEuros would break it.
    const euroSpace = 3 / 100 - 1 / 100;
    const centsSpace = (3 - 1) / 100;
    expect(euroSpace).not.toBe(centsSpace); // guard: these inputs genuinely diverge
    const { students } = buildStudentsFromEnrollments(
      [enroll({ amount_cents: 3, discount_cents: 1, financial_status: "paid" })],
      noTickets,
      noCompanions,
    );
    expect(students[0].amount).toBe(euroSpace);
    expect(students[0].amount).not.toBe(centsSpace);
  });

  it("a pending seat is listed but excluded from revenue", () => {
    const { students, revenue } = buildStudentsFromEnrollments(
      [enroll({ amount_cents: 12000, financial_status: "pending" })],
      noTickets,
      noCompanions,
    );
    expect(students).toHaveLength(1);
    expect(students[0].amount).toBe(120);
    expect(students[0].paymentStatus).toBe("pending");
    expect(revenue).toBe(0);
  });

  it("a null financial_status (legacy) still counts into revenue", () => {
    const { revenue } = buildStudentsFromEnrollments(
      [enroll({ amount_cents: 12000, financial_status: null })],
      noTickets,
      noCompanions,
    );
    expect(revenue).toBe(120);
  });

  it("sets nameMismatch + registrationName when buyer differs from participant", () => {
    const { students } = buildStudentsFromEnrollments(
      [
        enroll({
          buyer_name: "Bob Bianchi",
          corsista: {
            full_name: "Alice Rossi",
            email: "alice@example.com",
            phone: null,
            has_whatsapp: false,
          },
        }),
      ],
      noTickets,
      noCompanions,
    );
    expect(students[0].name).toBe("Alice Rossi");
    expect(students[0].buyerName).toBe("Bob Bianchi");
    expect(students[0].nameMismatch).toBe(true);
    expect(students[0].registrationName).toBe("Bob Bianchi");
  });

  it("no mismatch when buyer equals participant (case/space-insensitive)", () => {
    const { students } = buildStudentsFromEnrollments(
      [
        enroll({
          buyer_name: "  alice ROSSI ",
          corsista: {
            full_name: "Alice Rossi",
            email: "alice@example.com",
            phone: null,
            has_whatsapp: false,
          },
        }),
      ],
      noTickets,
      noCompanions,
    );
    expect(students[0].nameMismatch).toBe(false);
    expect(students[0].registrationName).toBeNull();
  });

  it("marks a doppio: tickets>1 sets isDuplicate; default is 1 ticket", () => {
    const tickets = new Map<number, number>([[100, 2]]);
    const { students } = buildStudentsFromEnrollments(
      [
        enroll({ id: 1, corsista_id: 100 }),
        enroll({ id: 2, corsista_id: 200 }),
      ],
      tickets,
      noCompanions,
    );
    expect(students[0].tickets).toBe(2);
    expect(students[0].ticketsInferred).toBe(2);
    expect(students[0].isDuplicate).toBe(true);
    expect(students[1].tickets).toBe(1); // default when absent from the map
    expect(students[1].isDuplicate).toBe(false);
  });

  it("seats_override wins over the inferred count; ticketsInferred keeps the auto value", () => {
    const inferred = new Map<number, number>([[100, 1]]); // Shopify says 1…
    const { students } = buildStudentsFromEnrollments(
      [enroll({ id: 1, corsista_id: 100, seats_override: 3 })], // …staff overrides to 3
      inferred,
      noCompanions,
    );
    expect(students[0].tickets).toBe(3); // effective = override
    expect(students[0].ticketsInferred).toBe(1); // auto value preserved
    expect(students[0].isDuplicate).toBe(true);
  });

  it("ignores an invalid seats_override (< 1), falling back to inferred", () => {
    const inferred = new Map<number, number>([[100, 2]]);
    const { students } = buildStudentsFromEnrollments(
      [enroll({ id: 1, corsista_id: 100, seats_override: 0 })],
      inferred,
      noCompanions,
    );
    expect(students[0].tickets).toBe(2);
  });

  it("attaches companions to the matching enrollment (empty array otherwise)", () => {
    const companions = new Map<number, CourseCompanion[]>([
      [1, [{ id: 9, name: "Guest One", phone: "+39 111" }]],
    ]);
    const { students } = buildStudentsFromEnrollments(
      [enroll({ id: 1, corsista_id: 100 }), enroll({ id: 2, corsista_id: 200 })],
      noTickets,
      companions,
    );
    expect(students[0].companions).toEqual([
      { id: 9, name: "Guest One", phone: "+39 111" },
    ]);
    expect(students[1].companions).toEqual([]);
  });

  it("maps ticketCode from line_item_id (null when absent) and tallies exams in row order", () => {
    const { students, examResults } = buildStudentsFromEnrollments(
      [
        enroll({ id: 1, line_item_id: 777, exam_result: "passed" }),
        enroll({ id: 2, line_item_id: null, exam_result: "failed" }),
        enroll({ id: 3, line_item_id: 888, exam_result: "passed" }),
      ],
      noTickets,
      noCompanions,
    );
    expect(students[0].ticketCode).toBe("777");
    expect(students[1].ticketCode).toBeNull();
    expect(examResults).toEqual({ passed: 2, retrial: 0, failed: 1 });
  });

  it("falls back to '—'/empty strings when the corsista join is missing", () => {
    const { students } = buildStudentsFromEnrollments(
      [enroll({ corsista: null, order_name: null, order_date: null })],
      noTickets,
      noCompanions,
    );
    expect(students[0].name).toBe("—");
    expect(students[0].email).toBe("");
    expect(students[0].phone).toBe("");
    expect(students[0].orderNumber).toBe("");
    expect(students[0].orderDate).toBe("");
    expect(students[0].hasWhatsApp).toBe(false);
  });

  it("normalizes the corsista embed when PostgREST returns it as an array", () => {
    const { students } = buildStudentsFromEnrollments(
      [
        enroll({
          corsista: [
            {
              full_name: "Array Embed",
              email: "arr@example.com",
              phone: "+39 999",
              has_whatsapp: true,
            },
          ],
        }),
      ],
      noTickets,
      noCompanions,
    );
    expect(students[0].name).toBe("Array Embed");
    expect(students[0].email).toBe("arr@example.com");
    expect(students[0].hasWhatsApp).toBe(true);
  });

  it("prefers the confirmed enrolled_email snapshot over corsisti.email (owner: Excel iscritti showed the stale Shopify address)", () => {
    const { students } = buildStudentsFromEnrollments(
      [enroll({ enrolled_email: "confermata@example.com" })],
      noTickets,
      noCompanions,
    );
    expect(students[0].email).toBe("confermata@example.com");
  });

  it("falls back to corsisti.email when enrolled_email is absent (pre-migration) or blank", () => {
    const { students: withoutSnapshot } = buildStudentsFromEnrollments(
      [enroll()],
      noTickets,
      noCompanions,
    );
    expect(withoutSnapshot[0].email).toBe("alice@example.com");

    const { students: blankSnapshot } = buildStudentsFromEnrollments(
      [enroll({ enrolled_email: "" })],
      noTickets,
      noCompanions,
    );
    expect(blankSnapshot[0].email).toBe("alice@example.com");
  });
});

describe("expandedLineItemIds (F4 multi-ticket)", () => {
  it("flags only line_item_ids present on more than one row", () => {
    const set = expandedLineItemIds([
      { line_item_id: 55 },
      { line_item_id: 55 },
      { line_item_id: 77 },
      { line_item_id: null },
    ]);
    expect(set.has(55)).toBe(true); // two rows → expanded
    expect(set.has(77)).toBe(false); // single row → not expanded
    expect(set.size).toBe(1);
  });
});

describe("buildStudentsFromEnrollments — F4 seats", () => {
  const noTickets = new Map<number, number>();
  const noCompanions = new Map<number, CourseCompanion[]>();

  it("Anna Salvagno: buyer + placeholder seat = 2 rows, no double-count, revenue on seat 1", () => {
    const rows: EnrollmentJoinRow[] = [
      enroll({
        id: 10,
        corsista_id: 100,
        seat_index: 1,
        line_item_id: 999,
        amount_cents: 30000,
        corsista: { full_name: "Anna Salvagno", email: "anna@x.it", phone: "", has_whatsapp: false },
      }),
      enroll({
        id: 11,
        corsista_id: 6926,
        seat_index: 2,
        line_item_id: 999,
        amount_cents: 0,
        financial_status: "paid",
        corsista: { full_name: "Posto 2 — da completare", email: "seat-1-999-2@placeholder.ssa", phone: "", has_whatsapp: false, placeholder: true },
      }),
    ];
    // purchases.quantity says 2 for Anna — the legacy inference that must be
    // suppressed now that the seat is a real row.
    const ticket = new Map<number, number>([[100, 2]]);
    const { students, revenue } = buildStudentsFromEnrollments(rows, ticket, noCompanions);

    expect(students).toHaveLength(2);
    const anna = students.find((s) => s.name === "Anna Salvagno")!;
    const seat2 = students.find((s) => s.placeholder)!;
    // No "doppio" badge / no phantom slots: the buyer counts as ONE seat.
    expect(anna.tickets).toBe(1);
    expect(anna.isDuplicate).toBe(false);
    expect(anna.placeholder).toBeFalsy();
    // The placeholder seat is flagged, at seat 2, €0.
    expect(seat2.placeholder).toBe(true);
    expect(seat2.seatIndex).toBe(2);
    expect(seat2.amount).toBe(0);
    // Revenue = the single line amount (invariant).
    expect(revenue).toBe(300);
  });

  it("orders a placeholder seat directly under its buyer", () => {
    const rows: EnrollmentJoinRow[] = [
      enroll({ id: 1, corsista_id: 1, seat_index: 2, line_item_id: 5, amount_cents: 0, corsista: { full_name: "Posto 2 — da completare", email: "seat-x-5-2@placeholder.ssa", phone: "", has_whatsapp: false, placeholder: true } }),
      enroll({ id: 2, corsista_id: 2, seat_index: 1, line_item_id: 5, amount_cents: 20000, corsista: { full_name: "Mario Buyer", email: "mario@x.it", phone: "", has_whatsapp: false } }),
    ];
    const { students } = buildStudentsFromEnrollments(rows, noTickets, noCompanions);
    expect(students[0].name).toBe("Mario Buyer"); // seat 1 first
    expect(students[1].placeholder).toBe(true); // seat 2 right after
  });

  it("a single-ticket line keeps the legacy inferred ticket count (no regression)", () => {
    const rows = [enroll({ corsista_id: 100, line_item_id: 42 })];
    const ticket = new Map<number, number>([[100, 2]]); // e.g. a genuine un-split doppio
    const { students } = buildStudentsFromEnrollments(rows, ticket, noCompanions);
    expect(students[0].tickets).toBe(2);
    expect(students[0].isDuplicate).toBe(true);
  });
});

describe("aggregateCourseEnrollments", () => {
  function agg(overrides: Partial<EnrollmentAggRow> = {}): EnrollmentAggRow {
    return {
      corso_id: 1,
      amount_cents: 12000,
      discount_cents: null,
      financial_status: "paid",
      ...overrides,
    };
  }

  it("sums paid rows into rev and counts every row into n", () => {
    const map = aggregateCourseEnrollments([
      agg({ corso_id: 1, amount_cents: 12000, financial_status: "paid" }),
      agg({ corso_id: 1, amount_cents: 8000, discount_cents: 2000, financial_status: "paid" }),
    ]);
    expect(map.get(1)).toEqual({ n: 2, rev: 120 + 60 });
  });

  it("counts pending rows in n but excludes them from rev", () => {
    const map = aggregateCourseEnrollments([
      agg({ corso_id: 1, amount_cents: 12000, financial_status: "paid" }),
      agg({ corso_id: 1, amount_cents: 12000, financial_status: "pending" }),
    ]);
    expect(map.get(1)).toEqual({ n: 2, rev: 120 });
  });

  it("treats a null/absent financial_status as paid (legacy rows)", () => {
    const map = aggregateCourseEnrollments([
      { corso_id: 1, amount_cents: 12000, discount_cents: null },
      agg({ corso_id: 1, amount_cents: 5000, financial_status: null }),
    ]);
    expect(map.get(1)).toEqual({ n: 2, rev: 120 + 50 });
  });

  it("aggregates independently per course id", () => {
    const map = aggregateCourseEnrollments([
      agg({ corso_id: 1, amount_cents: 12000 }),
      agg({ corso_id: 2, amount_cents: 8000 }),
      agg({ corso_id: 1, amount_cents: 12000, financial_status: "pending" }),
    ]);
    expect(map.get(1)).toEqual({ n: 2, rev: 120 });
    expect(map.get(2)).toEqual({ n: 1, rev: 80 });
  });

  it("uses the cents-space net (clamped at 0 for 100%-off)", () => {
    const map = aggregateCourseEnrollments([
      agg({ corso_id: 1, amount_cents: 12000, discount_cents: 15000 }),
    ]);
    expect(map.get(1)).toEqual({ n: 1, rev: 0 });
  });

  it("returns an empty map for no rows", () => {
    expect(aggregateCourseEnrollments([]).size).toBe(0);
  });
});

describe("sumAppliedCreditsForCourse", () => {
  it("sums importo_cents and converts to euros", () => {
    expect(
      sumAppliedCreditsForCourse([
        { importo_cents: 12000 },
        { importo_cents: 8000 },
      ]),
    ).toBe(200);
  });

  it("treats null importo_cents as 0", () => {
    expect(
      sumAppliedCreditsForCourse([{ importo_cents: null }, { importo_cents: 5000 }]),
    ).toBe(50);
  });

  it("returns 0 for no rows", () => {
    expect(sumAppliedCreditsForCourse([])).toBe(0);
  });
});

describe("groupAppliedCreditsByCourse", () => {
  it("sums importo_cents per destination course (kept in CENTS)", () => {
    const map = groupAppliedCreditsByCourse([
      { corso_destinazione_id: 1, importo_cents: 12000 },
      { corso_destinazione_id: 1, importo_cents: 8000 },
      { corso_destinazione_id: 2, importo_cents: 5000 },
    ]);
    // The map is CENTS; the index.ts caller divides by 100 at the mapping edge.
    expect(map.get(1)).toBe(20000);
    expect(map.get(2)).toBe(5000);
  });

  it("skips rows with a null destination course", () => {
    const map = groupAppliedCreditsByCourse([
      { corso_destinazione_id: null, importo_cents: 12000 },
      { corso_destinazione_id: 3, importo_cents: 3000 },
    ]);
    expect(map.has(null as unknown as number)).toBe(false);
    expect(map.get(3)).toBe(3000);
    expect(map.size).toBe(1);
  });

  it("treats null importo_cents as 0", () => {
    const map = groupAppliedCreditsByCourse([
      { corso_destinazione_id: 1, importo_cents: null },
      { corso_destinazione_id: 1, importo_cents: 2500 },
    ]);
    expect(map.get(1)).toBe(2500);
  });

  it("returns an empty map for no rows", () => {
    expect(groupAppliedCreditsByCourse([]).size).toBe(0);
  });
});
