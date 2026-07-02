import { describe, it, expect } from "vitest";
import { isBlockedByClosure, expiryForChoice } from "./lifecycle";

describe("isBlockedByClosure", () => {
  const closedAt = "2026-07-02T15:00:00.000Z";
  const closedEpoch = Math.floor(new Date(closedAt).getTime() / 1000);

  it("no closure → never blocked", () => {
    expect(isBlockedByClosure(null, undefined)).toBe(false);
    expect(isBlockedByClosure(null, closedEpoch + 100)).toBe(false);
  });

  it("closure blocks tokens issued before (or at) it", () => {
    expect(isBlockedByClosure(closedAt, closedEpoch - 100)).toBe(true);
    expect(isBlockedByClosure(closedAt, closedEpoch)).toBe(true);
  });

  it("closure blocks legacy tokens with no issue time", () => {
    expect(isBlockedByClosure(closedAt, undefined)).toBe(true);
  });

  it("a re-send AFTER the closure re-opens (fresh ia > closedAt)", () => {
    expect(isBlockedByClosure(closedAt, closedEpoch + 60)).toBe(false);
  });

  it("garbage closedAt fails open (never traps students on bad data)", () => {
    expect(isBlockedByClosure("not-a-date", undefined)).toBe(false);
  });
});

describe("expiryForChoice", () => {
  it("eod expires today, 7d expires in exactly 7 days", () => {
    const now = Math.floor(Date.now() / 1000);
    const eod = expiryForChoice("eod");
    const week = expiryForChoice("7d");
    expect(eod).toBeGreaterThan(now);
    expect(eod - now).toBeLessThanOrEqual(24 * 3600);
    expect(week - now).toBeGreaterThan(6.9 * 24 * 3600);
    expect(week - now).toBeLessThanOrEqual(7 * 24 * 3600);
  });
});
