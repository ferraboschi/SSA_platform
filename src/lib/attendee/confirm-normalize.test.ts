import { describe, it, expect } from "vitest";
import { normEmail, isValidEmail, normDeliveryNotes, MAX_NOTES_LEN } from "./confirm-normalize";

describe("normEmail / isValidEmail", () => {
  it("trims and lowercases", () => {
    expect(normEmail("  Anna@Real.IT ")).toBe("anna@real.it");
  });
  it("accepts a normal address, rejects junk", () => {
    expect(isValidEmail("anna@real.it")).toBe(true);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("two@@x.it")).toBe(false);
    expect(isValidEmail("spa ce@x.it")).toBe(false);
    expect(isValidEmail(`${"a".repeat(255)}@x.it`)).toBe(false);
  });
});

describe("normDeliveryNotes (optional — citofono / courier instructions)", () => {
  it("empty → undefined (leave the stored value untouched)", () => {
    expect(normDeliveryNotes("")).toEqual({ ok: true, value: undefined });
    expect(normDeliveryNotes("   ")).toEqual({ ok: true, value: undefined });
    expect(normDeliveryNotes(undefined)).toEqual({ ok: true, value: undefined });
  });
  it("trims and collapses internal whitespace", () => {
    expect(normDeliveryNotes("  Citofono  Bianchi \n (non Rossi) ")).toEqual({
      ok: true,
      value: "Citofono Bianchi (non Rossi)",
    });
  });
  it("rejects over-length notes", () => {
    const r = normDeliveryNotes("x".repeat(MAX_NOTES_LEN + 1));
    expect(r.ok).toBe(false);
  });
  it("accepts exactly the max length", () => {
    const r = normDeliveryNotes("x".repeat(MAX_NOTES_LEN));
    expect(r.ok).toBe(true);
  });
});
