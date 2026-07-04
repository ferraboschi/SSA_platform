import { describe, it, expect } from "vitest";
import {
  COURSE_PROFILE,
  EXAM_COURSE_TYPES,
  courseDayCount,
  courseHasExam,
  expectedDays,
  feedbackVariant,
} from "./constants";

describe("course profile — expected days", () => {
  it("matches the owner's real configurations", () => {
    expect(expectedDays("introduttivo", "presenza")).toBe(1);
    expect(expectedDays("introduttivo", "online")).toBe(3);
    expect(expectedDays("certificato", "presenza")).toBe(3);
    expect(expectedDays("certificato", "online")).toBe(9);
  });
});

describe("courseDayCount — program wins over baseline", () => {
  it("uses the real program length when present", () => {
    // A 9-day Certificato Online configured in the program shows 9, not the
    // presenza baseline of 3.
    expect(courseDayCount("certificato", "online", 9)).toBe(9);
    expect(courseDayCount("introduttivo", "presenza", 2)).toBe(2);
  });
  it("falls back to the expected baseline with no/empty program", () => {
    expect(courseDayCount("certificato", "online", null)).toBe(9);
    expect(courseDayCount("certificato", "presenza", 0)).toBe(3);
    expect(courseDayCount("introduttivo", "online", undefined)).toBe(3);
  });
});

describe("exam applicability", () => {
  it("only certificato + shochu culminate in an exam", () => {
    expect(courseHasExam("certificato")).toBe(true);
    expect(courseHasExam("shochu")).toBe(true);
    expect(courseHasExam("introduttivo")).toBe(false);
    expect(courseHasExam("masterclass")).toBe(false);
    expect(courseHasExam("mixology")).toBe(false);
  });
  it("EXAM_COURSE_TYPES is derived from the profile (single source)", () => {
    expect([...EXAM_COURSE_TYPES].sort()).toEqual(["certificato", "shochu"]);
  });
});

describe("feedback variant — short vs long, always present", () => {
  it("long for the exam courses, short for the quick ones", () => {
    expect(feedbackVariant("certificato")).toBe("long");
    expect(feedbackVariant("shochu")).toBe("long");
    expect(feedbackVariant("introduttivo")).toBe("short");
    expect(feedbackVariant("masterclass")).toBe("short");
  });
  it("every course type has a profile (so all have feedback)", () => {
    for (const t of Object.keys(COURSE_PROFILE)) {
      expect(["short", "long"]).toContain(COURSE_PROFILE[t as keyof typeof COURSE_PROFILE].feedback);
    }
  });
});
