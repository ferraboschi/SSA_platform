import { describe, it, expect } from "vitest";
import { findConfirmedResultByEmail, type GradedSubmission } from "./results";

// Minimal row builder — only the fields the matcher reads matter.
function row(over: Partial<GradedSubmission>): GradedSubmission {
  return {
    id: 1,
    studentName: "X",
    studentEmail: "x@y.it",
    testKey: "final",
    submittedAt: "2026-07-02T10:00:00Z",
    autoScore: 80,
    gradable: 10,
    manualCount: 0,
    suggested: "passed",
    enrollmentId: null,
    corsistaId: null,
    partecipanteId: null,
    currentResult: null,
    currentScore: null,
    lang: "it",
    registration: null,
    answers: [],
    ...over,
  };
}

describe("findConfirmedResultByEmail", () => {
  it("matches case-insensitively and requires a CONFIRMED result", () => {
    const subs = [
      row({ id: 1, studentEmail: "Anna@Real.IT", currentResult: null }),
      row({ id: 2, studentEmail: "anna@real.it", currentResult: "passed", enrollmentId: 9 }),
    ];
    expect(findConfirmedResultByEmail(subs, "ANNA@real.it")?.id).toBe(2);
  });

  it("returns null when nothing is confirmed", () => {
    const subs = [row({ currentResult: null })];
    expect(findConfirmedResultByEmail(subs, "x@y.it")).toBeNull();
  });

  it("shared email across kinds: the enrolled corsista's row wins over the companion's", () => {
    const subs = [
      // Companion first in array order (created_at desc) — must NOT win.
      row({ id: 10, studentEmail: "casa@fam.it", currentResult: "passed", partecipanteId: 5 }),
      row({ id: 11, studentEmail: "casa@fam.it", currentResult: "retrial", enrollmentId: 7 }),
    ];
    const hit = findConfirmedResultByEmail(subs, "casa@fam.it");
    expect(hit?.id).toBe(11);
    expect(hit?.enrollmentId).toBe(7);
  });

  it("companion-only match works (no corsista row)", () => {
    const subs = [row({ id: 20, studentEmail: "ospite@fam.it", currentResult: "passed", partecipanteId: 3 })];
    expect(findConfirmedResultByEmail(subs, "ospite@fam.it")?.partecipanteId).toBe(3);
  });
});
