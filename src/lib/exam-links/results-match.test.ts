import { describe, it, expect } from "vitest";
import { findConfirmedResultByEmail, preferActiveEnrollment, type GradedSubmission } from "./results";

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
    annullata: false,
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

describe("preferActiveEnrollment", () => {
  it("an active seat wins over a cancelled one, whatever the row order", () => {
    const cancelled = { id: 1, annullata_at: "2026-07-01T00:00:00Z" };
    const active = { id: 2, annullata_at: null };
    expect(preferActiveEnrollment([cancelled, active])?.id).toBe(2);
    expect(preferActiveEnrollment([active, cancelled])?.id).toBe(2);
  });

  it("falls back to the first cancelled seat (kept visible as posto rimosso), null when empty", () => {
    const a = { id: 1, annullata_at: "2026-07-01T00:00:00Z" };
    const b = { id: 2, annullata_at: "2026-07-02T00:00:00Z" };
    expect(preferActiveEnrollment([a, b])?.id).toBe(1);
    expect(preferActiveEnrollment([])).toBeNull();
  });

  it("a pre-migration row (no annullata_at column) counts as active", () => {
    const rows: { id: number; annullata_at?: string | null }[] = [{ id: 5 }];
    expect(preferActiveEnrollment(rows)?.id).toBe(5);
  });
});

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

  it("a removed seat (annullata) never counts as a confirmed result", () => {
    const only = [row({ id: 30, currentResult: "passed", enrollmentId: 4, annullata: true })];
    expect(findConfirmedResultByEmail(only, "x@y.it")).toBeNull();
    // A cancelled seat with a stored outcome must not shadow the re-enrolled active one.
    const both = [
      row({ id: 31, currentResult: "passed", enrollmentId: 4, annullata: true }),
      row({ id: 32, currentResult: "retrial", enrollmentId: 8 }),
    ];
    expect(findConfirmedResultByEmail(both, "x@y.it")?.id).toBe(32);
  });
});
