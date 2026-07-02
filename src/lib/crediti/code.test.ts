import { describe, it, expect } from "vitest";
import { generateCreditCode } from "./code";

describe("generateCreditCode", () => {
  it("is 10 chars by default and honours a custom length", () => {
    expect(generateCreditCode()).toHaveLength(10);
    expect(generateCreditCode(6)).toHaveLength(6);
  });

  it("uses only unambiguous uppercase alphanumerics (no O/0/I/1/L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCreditCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    }
  });

  it("is practically unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateCreditCode());
    expect(seen.size).toBe(5000);
  });
});
