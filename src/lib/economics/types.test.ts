import { describe, it, expect } from "vitest";
import { isToInvoice, isLegacyInvoiced, INVOICING_GO_LIVE, type EconCourseRow } from "./types";

const row = (over: Partial<EconCourseRow> & { ended: boolean }): EconCourseRow => ({
  id: "1",
  title: "Corso",
  type: "certificato",
  typeLabel: "Cert.",
  city: "Roma",
  month: "Giugno",
  year: 2026,
  revenue: 1000,
  econ: { advCost: null, advBy: null, advAt: null, invoiced: false, invoicedBy: null, invoicedAt: null },
  ...over,
});

describe("isToInvoice — held but not yet invoiced", () => {
  it("true only when the course ended AND is not marked invoiced", () => {
    expect(isToInvoice(row({ ended: true }))).toBe(true);
  });
  it("false when not ended", () => {
    expect(isToInvoice(row({ ended: false }))).toBe(false);
  });
  it("false when already invoiced", () => {
    expect(isToInvoice(row({ ended: true, econ: { ...row({ ended: true }).econ, invoiced: true } }))).toBe(false);
  });
});

describe("isLegacyInvoiced — pre-go-live presentation cutoff (Giugno 2026 = year 2026, month0 5)", () => {
  it("the go-live month itself is NOT legacy (first platform-tracked invoice)", () => {
    expect(isLegacyInvoiced(INVOICING_GO_LIVE.year, INVOICING_GO_LIVE.month0, true)).toBe(false);
  });
  it("the month before go-live IS legacy (Maggio 2026)", () => {
    expect(isLegacyInvoiced(2026, 4, true)).toBe(true);
  });
  it("a prior year is legacy", () => {
    expect(isLegacyInvoiced(2025, 11, true)).toBe(true); // Dic 2025
  });
  it("a later month is not legacy", () => {
    expect(isLegacyInvoiced(2026, 6, true)).toBe(false); // Luglio 2026
    expect(isLegacyInvoiced(2027, 0, true)).toBe(false);
  });
  it("a course that hasn't ended is never legacy", () => {
    expect(isLegacyInvoiced(2020, 0, false)).toBe(false);
  });
  it("an unknown month (monthIndexIt → -1) stays visible, not silently legacy", () => {
    expect(isLegacyInvoiced(2020, -1, true)).toBe(false);
    expect(isLegacyInvoiced(2020, 12, true)).toBe(false);
  });
});
