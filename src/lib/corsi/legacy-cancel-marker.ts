// ============================================================================
// The LEGACY "annullato" marker inside corsi.notebook — PURE, no imports.
//
// An early version of the Shopify sync (commit b8777e8, since refactored away)
// wrote `{ cancelled: true, cancelReason, cancelSignal }` into a course's
// notebook as an INFERENCE from the absence of data:
//   • signal "A"                → "0 iscritti + 0 ordini pagati" (phantom product)
//   • signal "draft-unpublished" → the Shopify product was still a draft.
// Nothing writes the marker any more, but ~30 prod rows still carry it and the
// mapper treated it as a STATE. Found 25/9/2026: the Shochu Milano 26-27/9
// course — product published on 9/7, 8 seats sold, ~€2.5k collected — still
// read "annullato" from its June-draft days: revenue and margin 0, hidden from
// the dashboard, the conto economico and the exam lists.
//
// Rule: the marker is an inference, the stored lifecycle is the state.
//   • stored lifecycle "pubblicato" (Shopify active + upcoming) → the marker is
//     VOID: a course on sale is by definition not annulled. The sync also
//     strips it from the row (stripLegacyCancelMarker) so the data stops lying.
//   • any other stored lifecycle → the marker still applies, unchanged (legacy
//     phantom products: past drafts with no data).
// A stored lifecycle "cancelled" (Shopify archived/deleted before the date) is
// the explicit state and always wins — that path never reads the marker.
// ============================================================================

export const LEGACY_CANCEL_KEYS = ["cancelled", "cancelReason", "cancelSignal"] as const;

function asRecord(notebook: unknown): Record<string, unknown> | null {
  return notebook && typeof notebook === "object" && !Array.isArray(notebook)
    ? (notebook as Record<string, unknown>)
    : null;
}

/** Whether the notebook carries the legacy `cancelled: true` marker. */
export function hasLegacyCancelMarker(notebook: unknown): boolean {
  return Boolean(asRecord(notebook)?.cancelled);
}

/** Whether the legacy marker still CANCELS the course: only while Shopify does
 *  not keep it on sale (stored lifecycle other than "pubblicato"). */
export function legacyMarkerCancels(
  notebook: unknown,
  storedLifecycle: string | null | undefined,
): boolean {
  return hasLegacyCancelMarker(notebook) && storedLifecycle !== "pubblicato";
}

/** The notebook without the marker keys (a copy — the input is never mutated). */
export function stripLegacyCancelMarker(notebook: unknown): Record<string, unknown> {
  const nb = { ...(asRecord(notebook) ?? {}) };
  for (const k of LEGACY_CANCEL_KEYS) delete nb[k];
  return nb;
}
