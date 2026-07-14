import { describe, it, expect } from "vitest";
import { isBlockedByAbsence, absentAccessError, absentSendError, testDayNo } from "./live-progress";

describe("presence gate (owner's rule: present at the roll-call to sit the test)", () => {
  it("testDayNo maps dayN to its appello day, others to null", () => {
    expect(testDayNo("day1")).toBe(1);
    expect(testDayNo("day9")).toBe(9);
    expect(testDayNo("final")).toBeNull();
    expect(testDayNo("feedback")).toBeNull();
  });

  it("blocks a subject not in the present set (and companions symmetrically)", () => {
    const present = new Set(["c10", "p7"]);
    expect(isBlockedByAbsence(present, "c10")).toBe(false);
    expect(isBlockedByAbsence(present, "p7")).toBe(false);
    expect(isBlockedByAbsence(present, "c99")).toBe(true);
    expect(isBlockedByAbsence(present, "p99")).toBe(true);
  });

  it("attendance UNKNOWN (null) fails open — a DB hiccup never locks a student out", () => {
    expect(isBlockedByAbsence(null, "c10")).toBe(false);
  });

  it("an EMPTY roll-call blocks (appello not compiled → nobody 'risulta presente')", () => {
    expect(isBlockedByAbsence(new Set(), "c10")).toBe(true);
  });

  it("final messages name the exam-day appello (owner's batch-7 rule)", () => {
    expect(absentAccessError("final")).toContain("giorno d'esame");
    expect(absentSendError("final")).toContain("giorno d'esame");
  });

  it("student-facing access message names the day for dayN, generic for final/feedback", () => {
    expect(absentAccessError("day2")).toContain("giorno 2");
    expect(absentAccessError("day2")).toContain("presente per sostenere");
    expect(absentAccessError("final")).toContain("presente per sostenere");
    // The educator-facing send message stays distinct.
    expect(absentSendError("day2")).toContain("non può ricevere");
  });
});
