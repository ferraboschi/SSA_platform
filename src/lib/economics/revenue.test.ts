import { describe, it, expect } from "vitest";
import { netPaidCents, netPaidEuros, isPaidRevenue } from "./revenue";

describe("netPaidCents", () => {
  it("returns the gross amount when there is no discount", () => {
    expect(netPaidCents({ amount_cents: 12000 })).toBe(12000);
    expect(netPaidCents({ amount_cents: 12000, discount_cents: 0 })).toBe(12000);
    expect(netPaidCents({ amount_cents: 12000, discount_cents: null })).toBe(12000);
  });

  it("subtracts a partial discount", () => {
    expect(netPaidCents({ amount_cents: 12000, discount_cents: 2000 })).toBe(10000);
  });

  it("returns 0 when the discount equals the amount", () => {
    expect(netPaidCents({ amount_cents: 12000, discount_cents: 12000 })).toBe(0);
  });

  it("clamps to 0 when the discount exceeds the amount", () => {
    expect(netPaidCents({ amount_cents: 12000, discount_cents: 15000 })).toBe(0);
  });

  it("treats null/undefined/missing amounts as 0", () => {
    expect(netPaidCents({})).toBe(0);
    expect(netPaidCents({ amount_cents: null })).toBe(0);
    expect(netPaidCents({ amount_cents: undefined })).toBe(0);
    expect(netPaidCents({ amount_cents: null, discount_cents: null })).toBe(0);
    expect(netPaidCents({ amount_cents: null, discount_cents: 500 })).toBe(0);
  });
});

describe("netPaidEuros", () => {
  it("is netPaidCents / 100", () => {
    expect(netPaidEuros({ amount_cents: 12000 })).toBe(120);
    expect(netPaidEuros({ amount_cents: 12000, discount_cents: 2000 })).toBe(100);
    expect(netPaidEuros({ amount_cents: 12500, discount_cents: 0 })).toBe(125);
    expect(netPaidEuros({ amount_cents: 12000, discount_cents: 15000 })).toBe(0);
    expect(netPaidEuros({})).toBe(0);
  });

  it("does not round (keeps sub-euro precision)", () => {
    expect(netPaidEuros({ amount_cents: 12345 })).toBeCloseTo(123.45, 10);
    expect(netPaidEuros({ amount_cents: 99 })).toBeCloseTo(0.99, 10);
  });
});

describe("isPaidRevenue", () => {
  it("is true for 'paid'", () => {
    expect(isPaidRevenue("paid")).toBe(true);
  });

  it("is true for null / undefined (legacy pre-enrichment rows count as paid)", () => {
    expect(isPaidRevenue(null)).toBe(true);
    expect(isPaidRevenue(undefined)).toBe(true);
  });

  it("is false for every non-paid status", () => {
    expect(isPaidRevenue("pending")).toBe(false);
    expect(isPaidRevenue("partially_paid")).toBe(false);
    expect(isPaidRevenue("refunded")).toBe(false);
    expect(isPaidRevenue("authorized")).toBe(false);
    expect(isPaidRevenue("partially_refunded")).toBe(false);
    expect(isPaidRevenue("voided")).toBe(false);
    expect(isPaidRevenue("")).toBe(false);
  });
});
