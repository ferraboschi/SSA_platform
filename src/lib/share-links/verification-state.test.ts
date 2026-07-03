import { describe, it, expect } from "vitest";
import {
  deriveVerificationState,
  canFreeEdit,
  chipLabel,
  shortTime,
  newerIso,
} from "./verification-state";

const NOW = new Date("2026-07-03T15:00:00");

describe("deriveVerificationState (the airtight flow)", () => {
  it("absent and nothing ever sent → assente (sending unavailable)", () => {
    expect(deriveVerificationState(false, null, null)).toBe("assente");
  });
  it("present, nothing sent → verificare (free edit)", () => {
    expect(deriveVerificationState(true, null, null)).toBe("verificare");
  });
  it("link out → attesa, even if presence is toggled off after the send", () => {
    expect(deriveVerificationState(true, "2026-07-03T10:00:00Z", null)).toBe("attesa");
    expect(deriveVerificationState(false, "2026-07-03T10:00:00Z", null)).toBe("attesa");
  });
  it("confirmed wins over everything (even if absent today)", () => {
    expect(deriveVerificationState(false, null, "2026-07-03T11:00:00Z")).toBe("confermato");
    expect(deriveVerificationState(true, "2026-07-03T10:00:00Z", "2026-07-03T11:00:00Z")).toBe("confermato");
  });
});

describe("canFreeEdit (mirrors the server lock)", () => {
  it("free only before any send and before confirmation", () => {
    expect(canFreeEdit(null, null)).toBe(true);
    expect(canFreeEdit("2026-07-03T10:00:00Z", null)).toBe(false);
    expect(canFreeEdit(null, "2026-07-03T11:00:00Z")).toBe(false);
    expect(canFreeEdit("2026-07-03T10:00:00Z", "2026-07-03T11:00:00Z")).toBe(false);
  });
});

describe("chipLabel (persistent server timestamps)", () => {
  it("attesa shows the sent time (same-day → HH:MM)", () => {
    expect(chipLabel("attesa", "2026-07-03T14:32:00", null, NOW)).toBe("Inviata 14:32 — in attesa");
  });
  it("attesa on a previous day shows dd/MM HH:MM", () => {
    expect(chipLabel("attesa", "2026-07-01T09:05:00", null, NOW)).toBe("Inviata 01/07 09:05 — in attesa");
  });
  it("attesa degrades without a timestamp (pre-migration)", () => {
    expect(chipLabel("attesa", null, null, NOW)).toBe("Inviata — in attesa");
  });
  it("confermato shows the confirmation time", () => {
    expect(chipLabel("confermato", null, "2026-07-03T15:07:00", NOW)).toBe("Confermato 15:07");
  });
  it("static states", () => {
    expect(chipLabel("assente", null, null, NOW)).toBe("Assente");
    expect(chipLabel("verificare", null, null, NOW)).toBe("Da verificare");
  });
});

describe("shortTime", () => {
  it("garbage → empty string", () => {
    expect(shortTime("not-a-date", NOW)).toBe("");
  });
});

describe("newerIso (poll can never revert an optimistic update)", () => {
  it("keeps the newer of the two", () => {
    expect(newerIso("2026-07-03T15:00:00Z", "2026-07-03T14:00:00Z")).toBe("2026-07-03T15:00:00Z");
    expect(newerIso("2026-07-03T14:00:00Z", "2026-07-03T15:00:00Z")).toBe("2026-07-03T15:00:00Z");
  });
  it("null-safe on both sides", () => {
    expect(newerIso(null, "2026-07-03T15:00:00Z")).toBe("2026-07-03T15:00:00Z");
    expect(newerIso("2026-07-03T15:00:00Z", null)).toBe("2026-07-03T15:00:00Z");
    expect(newerIso(null, null)).toBeNull();
  });
});
