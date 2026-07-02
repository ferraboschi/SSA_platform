// Pure normalization/validation for the /conferma attendee inputs — extracted
// so it is unit-testable without mocking Supabase (exam+confirm is the critical
// path; see confirm-normalize.test.ts).

export function normEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function isValidEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254;
}

export const MAX_ADDRESS_LEN = 300;

export type AddressNorm =
  | { ok: true; value: string | undefined }
  | { ok: false; error: string };

/** Normalize a delivery address: trim + collapse internal whitespace/newlines.
 *  Empty → undefined (meaning: leave the stored value untouched, so a student
 *  re-confirming only their email never wipes a saved address). */
export function normAddress(s: string | undefined): AddressNorm {
  const collapsed = (s ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return { ok: true, value: undefined };
  if (collapsed.length > MAX_ADDRESS_LEN) {
    return { ok: false, error: "Indirizzo troppo lungo." };
  }
  return { ok: true, value: collapsed };
}
