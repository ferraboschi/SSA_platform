import { describe, it, expect } from "vitest";
import {
  hasLegacyCancelMarker,
  legacyMarkerCancels,
  stripLegacyCancelMarker,
} from "./legacy-cancel-marker";

// The exact prod row that hid €2.5k of collected revenue (corso 64, 25/9/2026).
const SHOCHU_MILANO = {
  cancelled: true,
  cancelReason: "Prodotto Shopify non pubblicato (draft) — non sul sito",
  cancelSignal: "draft-unpublished",
};

describe("legacy cancel marker", () => {
  it("detects the marker only on a real notebook object", () => {
    expect(hasLegacyCancelMarker(SHOCHU_MILANO)).toBe(true);
    expect(hasLegacyCancelMarker({ cancelled: false })).toBe(false);
    expect(hasLegacyCancelMarker({})).toBe(false);
    expect(hasLegacyCancelMarker(null)).toBe(false);
    expect(hasLegacyCancelMarker(undefined)).toBe(false);
    expect(hasLegacyCancelMarker("cancelled")).toBe(false);
    expect(hasLegacyCancelMarker([{ cancelled: true }])).toBe(false);
  });

  it("is VOID on a course Shopify keeps on sale (stored lifecycle pubblicato)", () => {
    expect(legacyMarkerCancels(SHOCHU_MILANO, "pubblicato")).toBe(false);
  });

  it("still cancels the legacy phantom rows (draft / past / archived)", () => {
    for (const lc of ["bozza", "passato", "archiviato", "cancelled", null, undefined, ""]) {
      expect(legacyMarkerCancels(SHOCHU_MILANO, lc)).toBe(true);
    }
    expect(legacyMarkerCancels({ cancelled: true, cancelSignal: "A" }, "passato")).toBe(true);
  });

  it("never cancels without the marker, whatever the lifecycle", () => {
    expect(legacyMarkerCancels({}, "passato")).toBe(false);
    expect(legacyMarkerCancels({ adminNotes: [] }, "bozza")).toBe(false);
    expect(legacyMarkerCancels(null, "cancelled")).toBe(false);
  });

  it("strips exactly the three marker keys and keeps everything else, without mutating", () => {
    const nb = { ...SHOCHU_MILANO, adminNotes: [{ id: "1" }], plannedAction: "x", reasoning: "r" };
    const out = stripLegacyCancelMarker(nb);
    expect(out).toEqual({ adminNotes: [{ id: "1" }], plannedAction: "x", reasoning: "r" });
    expect(nb.cancelled).toBe(true); // input untouched
    expect(stripLegacyCancelMarker(null)).toEqual({});
    expect(stripLegacyCancelMarker({ tags: ["a"] })).toEqual({ tags: ["a"] });
  });
});
