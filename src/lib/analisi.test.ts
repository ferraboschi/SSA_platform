import { describe, it, expect } from "vitest";
import type { Course } from "@/lib/domain";
import {
  computeAnalisi,
  computeYearMatrix,
  computeYoyGrowth,
  rankActivities,
  rankCorsisti,
  rankEducators,
  type PurchaseAggRow,
} from "./analisi";

// ── Fixture helpers ─────────────────────────────────────────────────────────

function course(over: Partial<Course> & { id: string }): Course {
  return {
    handle: over.id,
    type: "certificato",
    typeLabel: "Certificato",
    typeShort: "CERT",
    typeColor: "azzurro",
    title: "Corso",
    shortTitle: "Corso",
    city: "Milano",
    mode: "presenza",
    month: "Giugno",
    year: 2025,
    day: 1,
    days: 3,
    educator: {
      id: "e1",
      name: "Lorenzo",
      role: "Educator",
      city: "",
      initials: "L",
      bio: "",
      years: 1,
      lang: [],
    },
    capacity: 20,
    enrolled: 10,
    minStudents: 5,
    price: 100,
    revenue: 1000,
    costs: { educator: 0, gestione: 0, diplomi: 0, libri: 0, location: 0, food: 0, adv: 0 },
    totalCost: 0,
    margin: 1000,
    status: "in-traiettoria",
    statusLabel: "",
    statusTone: "good",
    lifecycle: "passato",
    students: [],
    program: [],
    whatsappLink: "",
    shareLink: "",
    enrolUrl: "",
    notebook: { adminNotes: [], plannedAction: null, tags: [], reasoning: "" },
    ...over,
  };
}

function purchase(over: Partial<PurchaseAggRow>): PurchaseAggRow {
  return {
    cluster: "evento",
    subtype: null,
    product_title: "Prodotto",
    amount_cents: 10000,
    discount_cents: 0,
    financial_status: "paid",
    ordered_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

// ── computeAnalisi: the `today` parameter drives due/overdue maths ──────────

describe("computeAnalisi(today)", () => {
  const editions = [
    course({ id: "a", month: "Giugno", year: 2024, enrolled: 10 }),
    course({ id: "b", month: "Giugno", year: 2025, enrolled: 10 }),
  ];

  it("marks a city due and recommends it once its cadence has elapsed", () => {
    // 12-month cadence, last held Jun 2025 → due in Jun 2026.
    const data = computeAnalisi(editions, new Date(2026, 5, 15));
    expect(data.cityStats[0].due).toBe(true);
    expect(data.cityStats[0].monthsSinceLast).toBe(12);
    expect(data.recommendations).toHaveLength(1);
    expect(data.recommendations[0].suggestedMonth).toBe("Giugno");
    expect(data.recommendations[0].suggestedYear).toBe(2026);
  });

  it("keeps the same city on track when today is well before the next window", () => {
    const data = computeAnalisi(editions, new Date(2025, 7, 1)); // Aug 2025
    expect(data.cityStats[0].due).toBe(false);
    expect(data.cityStats[0].monthsSinceLast).toBe(2);
    expect(data.recommendations).toHaveLength(0); // dueIn 10 > 3
  });

  it("counts only PUBLISHED future courses as planned — never drafts", () => {
    const data = computeAnalisi(
      [
        course({ id: "held", lifecycle: "passato" }),
        course({ id: "pub", lifecycle: "pubblicato", year: 2027 }),
        course({ id: "draft", lifecycle: "bozza", year: 2027 }),
        course({ id: "dead", lifecycle: "pubblicato", year: 2027, cancelled: true }),
      ],
      new Date(2026, 6, 16),
    );
    expect(data.kpis.plannedCourses).toBe(1);
    expect(data.kpis.heldCourses).toBe(1);
  });
});

// ── Year × month matrix ─────────────────────────────────────────────────────

describe("computeYearMatrix", () => {
  it("builds one 12-cell row per year with totals and heat tiers", () => {
    const rows = computeYearMatrix([
      course({ id: "a", month: "Giugno", year: 2024, enrolled: 10 }),
      course({ id: "b", month: "Gennaio", year: 2025, enrolled: 10 }),
      course({ id: "c", month: "Giugno", year: 2025, enrolled: 30 }),
    ]);
    expect(rows.map((r) => r.year)).toEqual([2024, 2025]); // chronological
    const y2025 = rows[1];
    expect(y2025.cells).toHaveLength(12);
    expect(y2025.courses).toBe(2);
    expect(y2025.enrolled).toBe(40);
    // Peak cell (Jun 2025, 30 enrolled) is tier 4; 10/30 → tier 2; empty → 0.
    expect(y2025.cells[5]).toEqual({ courses: 1, enrolled: 30, tier: 4 });
    expect(y2025.cells[0]).toEqual({ courses: 1, enrolled: 10, tier: 2 });
    expect(y2025.cells[2]).toEqual({ courses: 0, enrolled: 0, tier: 0 });
  });

  it("gives a held month with zero enrolled the minimum visible tier", () => {
    const rows = computeYearMatrix([
      course({ id: "a", month: "Marzo", year: 2025, enrolled: 0 }),
      course({ id: "b", month: "Aprile", year: 2025, enrolled: 20 }),
    ]);
    expect(rows[0].cells[2].tier).toBe(1);
  });
});

// ── YoY growth ──────────────────────────────────────────────────────────────

describe("computeYoyGrowth", () => {
  const today = new Date(2026, 6, 16); // 16 Jul 2026 → window Jul 2025 … Jun 2026

  it("compares each of the last 12 complete months with the year before, weakest first", () => {
    const courses = [
      // Jun 2026: 8 vs Jun 2025: 12 → −4 (the weakest, must rank first)
      course({ id: "a", month: "Giugno", year: 2026, enrolled: 8 }),
      course({ id: "b", month: "Giugno", year: 2025, enrolled: 12 }),
      // Mar 2026: 10 vs Mar 2025: 6 → +4
      course({ id: "c", month: "Marzo", year: 2026, enrolled: 10 }),
      course({ id: "d", month: "Marzo", year: 2025, enrolled: 6 }),
      // Sep 2025: 5, nothing in Sep 2024 → +5
      course({ id: "e", month: "Settembre", year: 2025, enrolled: 5 }),
    ];
    const yoy = computeYoyGrowth(courses, today);
    expect(yoy.map((m) => m.deltaEnrolled)).toEqual([-4, 4, 5]); // ranked ascending
    const jun = yoy[0];
    expect(jun.month).toBe("Giugno");
    expect(jun.year).toBe(2026);
    expect(jun.prevYear).toBe(2025);
    expect(jun.enrolled).toBe(8);
    expect(jun.prevEnrolled).toBe(12);
    expect(jun.deltaCourses).toBe(0);
  });

  it("excludes the current (incomplete) month and non-held courses", () => {
    const yoy = computeYoyGrowth(
      [
        course({ id: "a", month: "Luglio", year: 2026, enrolled: 9 }), // current month
        course({ id: "b", month: "Maggio", year: 2026, enrolled: 9, lifecycle: "pubblicato" }),
        course({ id: "c", month: "Aprile", year: 2026, enrolled: 9, cancelled: true }),
      ],
      today,
    );
    expect(yoy).toHaveLength(0);
  });

  it("still surfaces a month that disappeared this year (prev only)", () => {
    const yoy = computeYoyGrowth(
      [course({ id: "a", month: "Ottobre", year: 2024, enrolled: 15 })],
      new Date(2025, 11, 1), // window Dec 2024 … Nov 2025 → Oct 2025 vs Oct 2024
    );
    expect(yoy).toHaveLength(1);
    expect(yoy[0].year).toBe(2025);
    expect(yoy[0].courses).toBe(0);
    expect(yoy[0].deltaEnrolled).toBe(-15);
  });
});

// ── Non-course activity ranking ─────────────────────────────────────────────

describe("rankActivities", () => {
  it("ranks non-course products by paid-only net revenue", () => {
    const rows: PurchaseAggRow[] = [
      purchase({ cluster: "corso", product_title: "Corso Roma", amount_cents: 99900 }), // excluded
      purchase({ cluster: "evento", product_title: "Sake Tasting", amount_cents: 10000 }),
      // legacy row: null financial_status counts as paid; net = 50 − 10 = 40
      purchase({
        cluster: "evento",
        product_title: "Sake Tasting",
        amount_cents: 5000,
        discount_cents: 1000,
        financial_status: null,
        ordered_at: "2026-03-01T00:00:00Z",
      }),
      // discount larger than amount → clamped to 0, never negative
      purchase({ cluster: "libro", product_title: "Libro Sake", amount_cents: 3000, discount_cents: 5000 }),
      purchase({ cluster: "merchandise", product_title: "T-shirt", financial_status: "pending" }), // excluded
    ];
    const ranked = rankActivities(rows);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      cluster: "evento",
      title: "Sake Tasting",
      orders: 2,
      revenue: 140,
      share: 100,
      lastAt: "2026-03-01T00:00:00Z",
    });
    expect(ranked[1]).toMatchObject({ cluster: "libro", title: "Libro Sake", revenue: 0 });
  });

  it("caps the ranking at `top`", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      purchase({ product_title: `Evento ${i}`, amount_cents: (i + 1) * 1000 }),
    );
    expect(rankActivities(rows)).toHaveLength(10);
    expect(rankActivities(rows, 3)).toHaveLength(3);
  });
});

// ── People rankings ─────────────────────────────────────────────────────────

describe("rankCorsisti", () => {
  it("ranks by courses attended (spend as tie-break) and drops placeholder seats", () => {
    const enr = (n: number) => Array.from({ length: n }, () => ({}));
    const ranked = rankCorsisti([
      { email: "a@x.it", name: "Anna", totalSpent: 500, courses: enr(3) },
      { email: "b@x.it", name: "Bruno", totalSpent: 900, courses: enr(3) },
      { email: "seat-2@ssa.placeholder", name: "Posto 2", totalSpent: 0, courses: enr(5) },
      { email: "c@x.it", name: "Carla", totalSpent: 100, courses: [] },
    ]);
    expect(ranked.map((p) => p.email)).toEqual(["b@x.it", "a@x.it"]);
    expect(ranked[0]).toEqual({ email: "b@x.it", name: "Bruno", courses: 3, totalSpent: 900 });
  });
});

describe("rankEducators", () => {
  it("groups HELD courses by educator name, skipping the placeholder", () => {
    const ed = (id: string, name: string) => ({
      id,
      name,
      role: "Educator",
      city: "",
      initials: name.slice(0, 1),
      bio: "",
      years: 1,
      lang: [],
    });
    const ranked = rankEducators([
      course({ id: "a", educator: ed("e1", "Lorenzo"), enrolled: 10 }),
      course({ id: "b", educator: ed("e1", "Lorenzo"), enrolled: 20 }),
      course({ id: "c", educator: ed("e2", "Camilla"), enrolled: 12 }),
      course({ id: "d", educator: ed("e2", "Camilla"), enrolled: 9, lifecycle: "pubblicato" }),
      course({ id: "e", educator: ed("", "—"), enrolled: 30 }),
    ]);
    expect(ranked).toEqual([
      { id: "e1", name: "Lorenzo", courses: 2, enrolled: 30 },
      { id: "e2", name: "Camilla", courses: 1, enrolled: 12 },
    ]);
  });
});
