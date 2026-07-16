import { describe, it, expect } from "vitest";
import { deadOrderStatus, isDeadOrder, prorateDiscount } from "./order-rules";

describe("isDeadOrder / deadOrderStatus — dead orders must stop counting as revenue", () => {
  it("a normal paid order is alive", () => {
    expect(isDeadOrder({ cancelled_at: null, financial_status: "paid" })).toBe(false);
    expect(deadOrderStatus({ cancelled_at: null, financial_status: "paid" })).toBeNull();
  });
  it("pending / partially_paid / null are alive (not revenue, but not dead)", () => {
    expect(isDeadOrder({ cancelled_at: null, financial_status: "pending" })).toBe(false);
    expect(isDeadOrder({ cancelled_at: null, financial_status: "partially_paid" })).toBe(false);
    expect(isDeadOrder({ cancelled_at: null, financial_status: null })).toBe(false);
  });
  it("refunded / voided are dead and keep their real Shopify status", () => {
    expect(deadOrderStatus({ cancelled_at: null, financial_status: "refunded" })).toBe("refunded");
    expect(deadOrderStatus({ cancelled_at: null, financial_status: "voided" })).toBe("voided");
  });
  it("financial_status casing is normalized", () => {
    expect(deadOrderStatus({ cancelled_at: null, financial_status: "Refunded" })).toBe("refunded");
  });
  it("cancelled_at set (even while status says paid) is dead → 'cancelled'", () => {
    expect(deadOrderStatus({ cancelled_at: "2026-07-01T10:00:00Z", financial_status: "paid" })).toBe(
      "cancelled",
    );
    expect(isDeadOrder({ cancelled_at: "2026-07-01T10:00:00Z", financial_status: null })).toBe(true);
  });
  it("cancelled AND refunded → the refund status wins (real Shopify value)", () => {
    expect(
      deadOrderStatus({ cancelled_at: "2026-07-01T10:00:00Z", financial_status: "refunded" }),
    ).toBe("refunded");
  });
});

describe("prorateDiscount — order discount splits across lines, total exact", () => {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  it("single line takes the whole discount", () => {
    expect(prorateDiscount([15000], 2000)).toEqual([2000]);
  });
  it("proportional split on a clean ratio", () => {
    // €150 + €50 lines, €40 off → €30 + €10.
    expect(prorateDiscount([15000, 5000], 4000)).toEqual([3000, 1000]);
  });
  it("rounding: remainder cents go to the largest line, total matches exactly", () => {
    // Three equal lines, 100 cents: 33+33+33=99, remainder → first (largest tie).
    expect(prorateDiscount([1000, 1000, 1000], 100)).toEqual([34, 33, 33]);
    // Uneven lines: floors + remainder on the largest.
    const r = prorateDiscount([9999, 5001, 3333], 1000);
    expect(sum(r)).toBe(1000);
    expect(r[0]).toBeGreaterThanOrEqual(r[1]);
  });
  it("zero-value lines get nothing; paid lines absorb everything", () => {
    expect(prorateDiscount([10000, 0], 1500)).toEqual([1500, 0]);
    expect(prorateDiscount([0, 10000, 0], 999)).toEqual([0, 999, 0]);
  });
  it("all-zero lines: discount lands on the first line (total still exact)", () => {
    expect(prorateDiscount([0, 0], 500)).toEqual([500, 0]);
  });
  it("discount larger than the order total is still distributed in full", () => {
    const r = prorateDiscount([6000, 4000], 15000);
    expect(r).toEqual([9000, 6000]);
    expect(sum(r)).toBe(15000);
  });
  it("degenerate inputs: empty lines, zero/negative discount", () => {
    expect(prorateDiscount([], 1000)).toEqual([]);
    expect(prorateDiscount([1000, 2000], 0)).toEqual([0, 0]);
    expect(prorateDiscount([1000, 2000], -500)).toEqual([0, 0]);
  });
  it("the double-subtraction bug is gone: 2×€150 lines with €20 off ≠ €20 each", () => {
    const r = prorateDiscount([15000, 15000], 2000);
    expect(sum(r)).toBe(2000); // was 4000 with the copy-to-every-line behaviour
  });
});
