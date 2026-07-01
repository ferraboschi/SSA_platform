import { describe, it, expect } from "vitest";
import { formatEuro, formatNumberIt } from "./format";

describe("formatEuro", () => {
  describe("auto decimals (default)", () => {
    it("shows no decimals for whole euros", () => {
      expect(formatEuro(1234)).toBe("1.234 €");
    });

    it("shows two decimals for non-integers", () => {
      expect(formatEuro(1234.5)).toBe("1.234,50 €");
      expect(formatEuro(123.44)).toBe("123,44 €");
    });

    it("groups thousands", () => {
      expect(formatEuro(1000000)).toBe("1.000.000 €");
    });

    it("formats zero as a whole euro", () => {
      expect(formatEuro(0)).toBe("0 €");
    });

    it("formats negatives naturally", () => {
      expect(formatEuro(-1234)).toBe("-1.234 €");
      expect(formatEuro(-1234.5)).toBe("-1.234,50 €");
    });
  });

  describe("decimals: 0", () => {
    it("forces whole euros and rounds", () => {
      expect(formatEuro(1234.99, { decimals: 0 })).toBe("1.235 €");
      expect(formatEuro(1234.4, { decimals: 0 })).toBe("1.234 €");
      expect(formatEuro(123.44, { decimals: 0 })).toBe("123 €");
    });
  });

  describe("decimals: 2", () => {
    it("always shows exactly two decimals", () => {
      expect(formatEuro(1234, { decimals: 2 })).toBe("1.234,00 €");
      expect(formatEuro(123.44, { decimals: 2 })).toBe("123,44 €");
      expect(formatEuro(0, { decimals: 2 })).toBe("0,00 €");
    });
  });

  describe("guarded fallback", () => {
    it("returns 0 € for NaN", () => {
      expect(formatEuro(Number.NaN)).toBe("0 €");
    });

    it("returns 0 € for Infinity", () => {
      expect(formatEuro(Number.POSITIVE_INFINITY)).toBe("0 €");
      expect(formatEuro(Number.NEGATIVE_INFINITY)).toBe("0 €");
    });

    it("keeps the fallback even when decimals are forced", () => {
      expect(formatEuro(Number.NaN, { decimals: 2 })).toBe("0 €");
    });
  });
});

describe("formatNumberIt (grouped, no symbol — for unit-slot sites)", () => {
  it("groups from four digits, comma decimals, NO euro symbol", () => {
    expect(formatNumberIt(1234)).toBe("1.234");
    expect(formatNumberIt(1234.5)).toBe("1.234,50");
    expect(formatNumberIt(1000000)).toBe("1.000.000");
    expect(formatNumberIt(0)).toBe("0");
    expect(formatNumberIt(-1234)).toBe("-1.234");
  });
  it("honours forced decimals", () => {
    expect(formatNumberIt(1234, { decimals: 2 })).toBe("1.234,00");
    expect(formatNumberIt(1234.99, { decimals: 0 })).toBe("1.235");
  });
  it("guards NaN/Infinity to '0'", () => {
    expect(formatNumberIt(Number.NaN)).toBe("0");
    expect(formatNumberIt(Number.POSITIVE_INFINITY)).toBe("0");
  });
  it("formatEuro is formatNumberIt + ' €'", () => {
    expect(formatEuro(1234)).toBe(formatNumberIt(1234) + " €");
  });
});
