import { describe, expect, it } from "vitest";
import {
  paymentStatusKind,
  summarizePayments,
  type PaymentRow,
} from "./summary";

function row(over: Partial<PaymentRow>): PaymentRow {
  return {
    orderName: "SSA1000",
    externalId: "1000",
    orderedAt: "2026-07-10T10:00:00Z",
    buyerName: "Mario Rossi",
    buyerEmail: "mario@example.com",
    corsistaId: 1,
    productTitle: "Corso Certificato",
    cluster: "corso",
    subtype: null,
    quantity: 1,
    grossCents: 10000,
    discountCents: 0,
    netCents: 10000,
    financialStatus: "paid",
    courseHandle: null,
    ...over,
  };
}

describe("paymentStatusKind", () => {
  it("classifies paid / refunded / voided / null / pending-ish", () => {
    expect(paymentStatusKind("paid")).toBe("paid");
    expect(paymentStatusKind("refunded")).toBe("refunded");
    expect(paymentStatusKind("voided")).toBe("refunded");
    expect(paymentStatusKind(null)).toBe("none");
    expect(paymentStatusKind(undefined)).toBe("none");
    expect(paymentStatusKind("pending")).toBe("pending");
    expect(paymentStatusKind("partially_paid")).toBe("pending");
    expect(paymentStatusKind("authorized")).toBe("pending");
    expect(paymentStatusKind("partially_refunded")).toBe("pending");
  });
});

describe("summarizePayments", () => {
  const now = new Date("2026-07-16T12:00:00Z");

  it("sums paid-only net all time; null status counts as paid (legacy rule)", () => {
    const s = summarizePayments(
      [
        row({ netCents: 10000 }),
        row({ externalId: "1001", netCents: 5000, financialStatus: null }),
        row({ externalId: "1002", netCents: 7000, financialStatus: "pending" }),
        row({ externalId: "1003", netCents: 3000, financialStatus: "refunded" }),
      ],
      now,
    );
    expect(s.totalPaidCents).toBe(15000); // paid + null, never pending/refunded
    expect(s.pendingCents).toBe(7000); // pending only — refunded/voided excluded
    expect(s.orderCount).toBe(4);
  });

  it("month KPI counts only paid lines inside the current calendar month", () => {
    const s = summarizePayments(
      [
        // Mid-month timestamps: the month check runs in LOCAL time (it must
        // agree with the locally-formatted Data column), so boundary instants
        // would make the test timezone-dependent.
        row({ orderedAt: "2026-07-10T12:00:00Z", netCents: 1000 }),
        row({ externalId: "2", orderedAt: "2026-06-15T12:00:00Z", netCents: 2000 }),
        row({ externalId: "3", orderedAt: "2025-07-10T10:00:00Z", netCents: 4000 }),
        // In-month but pending → excluded from both paid KPIs.
        row({
          externalId: "4",
          orderedAt: "2026-07-05T10:00:00Z",
          netCents: 8000,
          financialStatus: "pending",
        }),
        row({ externalId: "5", orderedAt: null, netCents: 16000 }),
      ],
      now,
    );
    expect(s.monthPaidCents).toBe(1000);
    expect(s.totalPaidCents).toBe(1000 + 2000 + 4000 + 16000);
  });

  it("counts distinct order ids, not lines", () => {
    const s = summarizePayments(
      [
        row({ externalId: "10" }),
        row({ externalId: "10", productTitle: "Libro" }),
        row({ externalId: "11" }),
        row({ externalId: "" }), // defensive: blank id never counted
      ],
      now,
    );
    expect(s.orderCount).toBe(2);
  });

  it("returns zeros on an empty register", () => {
    expect(summarizePayments([], now)).toEqual({
      totalPaidCents: 0,
      monthPaidCents: 0,
      pendingCents: 0,
      orderCount: 0,
    });
  });
});
