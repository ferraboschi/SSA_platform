// Pure normalization/validation for the /conferma attendee inputs — extracted
// so it is unit-testable without mocking Supabase (exam+confirm is the critical
// path; see confirm-normalize.test.ts).

export function normEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function isValidEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 254;
}

export const MAX_NOTES_LEN = 200;

export type NotesNorm =
  | { ok: true; value: string | undefined }
  | { ok: false; error: string };

/** Normalize the OPTIONAL delivery notes (citofono name, courier
 *  instructions). Empty → undefined: a blank re-confirm never wipes a
 *  previously saved note. (The delivery ADDRESS is structured and validated in
 *  delivery-address.ts.) */
export function normDeliveryNotes(s: string | undefined): NotesNorm {
  const collapsed = (s ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return { ok: true, value: undefined };
  if (collapsed.length > MAX_NOTES_LEN) {
    return { ok: false, error: "Note troppo lunghe." };
  }
  return { ok: true, value: collapsed };
}
