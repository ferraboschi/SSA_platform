import { describe, it, expect } from "vitest";
import { endOfDayEpochSeconds } from "./lifecycle-time";

function dateInZone(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

describe("endOfDayEpochSeconds", () => {
  it("returns an instant still on the same Rome day, with the next second on the next day", () => {
    const now = new Date("2026-07-02T10:00:00Z");
    const eod = endOfDayEpochSeconds("Europe/Rome", now);
    expect(dateInZone("Europe/Rome", new Date(eod * 1000))).toBe("2026-07-02");
    expect(dateInZone("Europe/Rome", new Date((eod + 1) * 1000))).toBe("2026-07-03");
  });

  it("is always in the future and within 24h", () => {
    const now = new Date("2026-07-02T21:30:00Z"); // 23:30 Rome (CEST)
    const eod = endOfDayEpochSeconds("Europe/Rome", now);
    const delta = eod - Math.floor(now.getTime() / 1000);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(24 * 3600);
  });

  it("handles the CET→CEST spring-forward day", () => {
    // 2026-03-29: Europe/Rome jumps 02:00→03:00 (23h day).
    const now = new Date("2026-03-29T08:00:00Z");
    const eod = endOfDayEpochSeconds("Europe/Rome", now);
    expect(dateInZone("Europe/Rome", new Date(eod * 1000))).toBe("2026-03-29");
    expect(dateInZone("Europe/Rome", new Date((eod + 1) * 1000))).toBe("2026-03-30");
  });

  it("handles the CEST→CET fall-back day (25h)", () => {
    // 2026-10-25: Europe/Rome repeats 02:00-03:00.
    const now = new Date("2026-10-25T08:00:00Z");
    const eod = endOfDayEpochSeconds("Europe/Rome", now);
    expect(dateInZone("Europe/Rome", new Date(eod * 1000))).toBe("2026-10-25");
    expect(dateInZone("Europe/Rome", new Date((eod + 1) * 1000))).toBe("2026-10-26");
  });
});
