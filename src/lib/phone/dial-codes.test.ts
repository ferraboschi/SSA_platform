import { describe, it, expect } from "vitest";
import { splitPhone, COUNTRY_CODES } from "./dial-codes";

describe("splitPhone", () => {
  it("splits a plain Italian number by its +39 prefix", () => {
    expect(splitPhone("+39 333 1234567")).toEqual({ code: "+39", num: "333 1234567" });
  });

  it("keeps 3-digit codes intact (regression: San Marino/Portugal/Slovenia were corrupted)", () => {
    expect(splitPhone("+378 0549 123456")).toEqual({ code: "+378", num: "0549 123456" });
    expect(splitPhone("+351 912345678")).toEqual({ code: "+351", num: "912345678" });
    expect(splitPhone("+386 40 123 456")).toEqual({ code: "+386", num: "40 123 456" });
  });

  it("longest-match wins so a 2-digit code never shadows a 3-digit one", () => {
    // +385 (Croatia) must not be read as +38…; every listed code round-trips.
    for (const { c } of COUNTRY_CODES) {
      expect(splitPhone(`${c} 1234567`)).toEqual({ code: c, num: "1234567" });
    }
  });

  it("keeps an unknown '+' code verbatim instead of relabeling it +39 and dropping it", () => {
    expect(splitPhone("+999 12345")).toEqual({ code: "+999", num: "12345" });
  });

  it("defaults to Italy only when there is no dial code at all", () => {
    expect(splitPhone("333 1234567")).toEqual({ code: "+39", num: "333 1234567" });
    expect(splitPhone("")).toEqual({ code: "+39", num: "" });
  });
});
