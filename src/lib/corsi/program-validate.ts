// Pure validation of a course's day structure — shared by the Programma editor
// (live banner) and any read surface (course badge). No I/O, no React.
//
// The real day count is the operator's editable program; `expected` is the
// baseline for the course type + mode (COURSE_PROFILE). Real ≠ expected is
// LEGAL (the owner wants to add/remove days) but surfaced as a soft warning.

export const MAX_COURSE_DAYS = 9;

export type ProgramIssueLevel = "warning" | "error";

export interface ProgramIssue {
  level: ProgramIssueLevel;
  message: string;
}

/** Validate the day count. `expected` is optional (null → no baseline, no
 *  mismatch alarm). Returns the issues to show, most severe first. */
export function validateDays(real: number, expected?: number | null): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  if (real <= 0) {
    issues.push({ level: "error", message: "Il corso non ha giorni: aggiungine almeno uno." });
    return issues; // nothing else matters
  }
  if (real > MAX_COURSE_DAYS) {
    issues.push({
      level: "error",
      message: `Troppi giorni (${real}): il massimo è ${MAX_COURSE_DAYS}.`,
    });
  }
  if (typeof expected === "number" && expected > 0 && real !== expected) {
    issues.push({
      level: "warning",
      message:
        real < expected
          ? `Attesi ${expected} giorni per questo tipo di corso, ne hai configurati ${real}. Confermi la struttura personalizzata?`
          : `Questo tipo di corso ne prevede ${expected}, ma ne hai configurati ${real}. Confermi la struttura personalizzata?`,
    });
  }
  return issues;
}
