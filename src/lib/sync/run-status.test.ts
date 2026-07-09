import { describe, it, expect } from "vitest";
import { isRunInFlight, SYNC_RUN_STALE_MS } from "./run-status";

const T0 = Date.parse("2026-07-09T12:00:00.000Z");
const iso = (msAgo: number) => new Date(T0 - msAgo).toISOString();

describe("run-status — in-flight detection for the async sync", () => {
  it("no status / no running flag / missing startedAt → not in flight", () => {
    expect(isRunInFlight(null, T0)).toBe(false);
    expect(isRunInFlight({ running: false, startedAt: iso(1000) }, T0)).toBe(false);
    expect(isRunInFlight({ running: true }, T0)).toBe(false);
    expect(isRunInFlight({ running: true, startedAt: "garbage" }, T0)).toBe(false);
  });

  it("a fresh running marker blocks a second start", () => {
    expect(isRunInFlight({ running: true, startedAt: iso(30_000) }, T0)).toBe(true);
    expect(isRunInFlight({ running: true, startedAt: iso(SYNC_RUN_STALE_MS - 1000) }, T0)).toBe(true);
  });

  it("a stale running marker (dead run after crash/restart) does NOT block", () => {
    expect(isRunInFlight({ running: true, startedAt: iso(SYNC_RUN_STALE_MS + 1000) }, T0)).toBe(false);
  });

  it("a finished run never blocks, however recent", () => {
    expect(
      isRunInFlight({ running: false, startedAt: iso(5_000), finishedAt: iso(1_000), ok: true }, T0),
    ).toBe(false);
  });
});
