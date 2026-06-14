import { describe, it, expect } from "vitest";
import { MONTH_NAMES_IT, MONTH_TO_NUM, monthIndexIt, parseItDate } from "./italian-months";

describe("italian-months tables", () => {
  it("has 12 capitalized names, Gennaio→Dicembre", () => {
    expect(MONTH_NAMES_IT).toHaveLength(12);
    expect(MONTH_NAMES_IT[0]).toBe("Gennaio");
    expect(MONTH_NAMES_IT[11]).toBe("Dicembre");
  });

  it("maps lowercase names to 1-based numbers", () => {
    expect(MONTH_TO_NUM.gennaio).toBe(1);
    expect(MONTH_TO_NUM.dicembre).toBe(12);
    expect(Object.keys(MONTH_TO_NUM)).toHaveLength(12);
  });

  it("monthIndexIt is 0-based, case-sensitive, -1 on unknown", () => {
    expect(monthIndexIt("Gennaio")).toBe(0);
    expect(monthIndexIt("Dicembre")).toBe(11);
    expect(monthIndexIt("gennaio")).toBe(-1); // capitalized only, by design
    expect(monthIndexIt("Frobtober")).toBe(-1);
  });
});

describe("parseItDate", () => {
  it("parses a single day + month + year", () => {
    expect(parseItDate("4 Settembre 2026")).toEqual({ day: 4, month: 9, year: 2026 });
  });

  it("is case-insensitive and tolerates extra text", () => {
    expect(parseItDate("Corso il 14 settembre, Roma")).toEqual({ day: 14, month: 9, year: null });
  });

  it("takes the FIRST standalone day of a multi-day range", () => {
    expect(parseItDate("12, 13, 14 Giugno 2026")).toEqual({ day: 12, month: 6, year: 2026 });
  });

  it("picks the EARLIEST month when several are mentioned (course before exam date)", () => {
    // "5 Ottobre … esame 9 Novembre" → the course month (October) wins.
    expect(parseItDate("5 Ottobre, esame 9 Novembre 2026").month).toBe(10);
  });

  it("does not mistake a 4-digit year for a day", () => {
    expect(parseItDate("Marzo 2027")).toEqual({ day: null, month: 3, year: 2027 });
  });

  it("returns all-null for text without a month", () => {
    expect(parseItDate("nessuna data qui")).toEqual({ day: null, month: null, year: null });
  });

  it("ignores out-of-range days", () => {
    expect(parseItDate("99 Aprile").day).toBeNull();
  });

  it("handles empty / nullish input", () => {
    expect(parseItDate("")).toEqual({ day: null, month: null, year: null });
    expect(parseItDate(undefined as unknown as string)).toEqual({ day: null, month: null, year: null });
  });
});
