import { describe, it, expect } from "vitest";
import { addressHasCivico } from "./civico";

describe("addressHasCivico — postal codes never count as a civic number", () => {
  it("the owner's field case: CAP present, no civic number → NOT detected", () => {
    expect(addressHasCivico("V. del Corso, 00186 Roma RM, Italia")).toBe(false);
    expect(addressHasCivico("Via Roma, 20121 Milano MI, Italia")).toBe(false);
  });
  it("a real civic number in the street segment → detected", () => {
    expect(addressHasCivico("Via del Corso 12, 00186 Roma RM, Italia")).toBe(true);
    expect(addressHasCivico("Via Roma 12/B, Milano")).toBe(true);
    expect(addressHasCivico("221B Baker Street, London")).toBe(true);
    expect(addressHasCivico("1-2-3 Ginza, Chuo-ku, Tokyo")).toBe(true);
  });
  it("an inline 5-digit CAP in the street segment is stripped", () => {
    expect(addressHasCivico("Via Roma 00186, Roma")).toBe(false);
    expect(addressHasCivico("Via Roma 12 00186 Roma")).toBe(true);
  });
  it("digits only in later segments (city/CAP/apartment) do not count", () => {
    expect(addressHasCivico("Baker Street, London NW1 6XE")).toBe(false);
    expect(addressHasCivico("Via Verdi, interno 3, Milano")).toBe(false);
  });
  // Google Places puts a comma between street and number ("Via X, 25, CAP…"):
  // the owner's screenshot case — the green badge said detected (Places meta)
  // while this text rule said missing, blocking the submit.
  it("a standalone civic-number segment right after the street → detected", () => {
    expect(addressHasCivico("Via Lorenteggio, 25, 20146 Milano MI, Italia")).toBe(true);
    expect(addressHasCivico("Via Lorenteggio, 25/B, 20146 Milano MI, Italia")).toBe(true);
    expect(addressHasCivico("Corso Buenos Aires, 12 bis, Milano")).toBe(true);
    expect(addressHasCivico("Via Napoli, 12-14, Bari")).toBe(true);
  });
  it("a bare CAP as the second segment does NOT count", () => {
    expect(addressHasCivico("Via Roma, 20146, Milano")).toBe(false);
    expect(addressHasCivico("Via Roma, 20146 Milano MI, Italia")).toBe(false);
  });
  it("SNC (senza numero civico) is accepted anywhere", () => {
    expect(addressHasCivico("Via della Stazione SNC, Frosinone")).toBe(true);
    expect(addressHasCivico("Contrada Pantano, snc, 87100 Cosenza")).toBe(true);
  });
  it("empty/garbage → not detected", () => {
    expect(addressHasCivico("")).toBe(false);
    expect(addressHasCivico("Roma")).toBe(false);
  });
});
