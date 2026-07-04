import { describe, it, expect } from "vitest";
import { validateDays, MAX_COURSE_DAYS } from "./program-validate";

describe("validateDays", () => {
  it("no issues when real matches expected", () => {
    expect(validateDays(3, 3)).toEqual([]);
    expect(validateDays(9, 9)).toEqual([]);
  });
  it("no baseline → no mismatch alarm", () => {
    expect(validateDays(5)).toEqual([]);
    expect(validateDays(5, null)).toEqual([]);
  });
  it("warns (not errors) when real differs from expected — both directions", () => {
    const fewer = validateDays(7, 9);
    expect(fewer).toHaveLength(1);
    expect(fewer[0].level).toBe("warning");
    expect(fewer[0].message).toContain("9");
    expect(validateDays(4, 3)[0].level).toBe("warning");
  });
  it("errors on 0 days and stops", () => {
    const r = validateDays(0, 3);
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe("error");
  });
  it("errors when over the max", () => {
    const r = validateDays(MAX_COURSE_DAYS + 1, MAX_COURSE_DAYS + 1);
    expect(r.some((i) => i.level === "error")).toBe(true);
  });
});
