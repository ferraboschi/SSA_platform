import { describe, it, expect } from "vitest";
import { createFixedWindowLimiter } from "./rate-limit";

const WINDOW = 60_000;

describe("createFixedWindowLimiter (fixed-window, per-instance)", () => {
  it("allows up to `limit` hits then trips on limit+1", () => {
    const lim = createFixedWindowLimiter(WINDOW);
    const now = 1_000_000;
    // First `limit` calls are allowed (each records a hit).
    for (let i = 0; i < 3; i++) {
      expect(lim.isLimited("b", "k", 3, now)).toBe(false);
    }
    // The (limit+1)-th call within the same window trips.
    expect(lim.isLimited("b", "k", 3, now)).toBe(true);
  });

  it("allows a hit again once the window has fully advanced", () => {
    const lim = createFixedWindowLimiter(WINDOW);
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(lim.isLimited("b", "k", 3, now)).toBe(false);
    expect(lim.isLimited("b", "k", 3, now)).toBe(true);
    // Past the window (cutoff drops the old hits) → allowed again.
    expect(lim.isLimited("b", "k", 3, now + WINDOW + 1)).toBe(false);
  });

  it("keeps different keys and buckets independent", () => {
    const lim = createFixedWindowLimiter(WINDOW);
    const now = 1_000_000;
    // Exhaust bucket "b", key "k1".
    for (let i = 0; i < 2; i++) expect(lim.isLimited("b", "k1", 2, now)).toBe(false);
    expect(lim.isLimited("b", "k1", 2, now)).toBe(true);
    // Same bucket, different key → its own window.
    expect(lim.isLimited("b", "k2", 2, now)).toBe(false);
    // Different bucket, same key → its own window.
    expect(lim.isLimited("other", "k1", 2, now)).toBe(false);
  });

  it("the over-limit call does not consume a slot or extend the window", () => {
    const lim = createFixedWindowLimiter(WINDOW);
    const start = 1_000_000;
    // limit=1 so the invariant is actually observable: fill the window with the
    // single allowed hit at t=start.
    expect(lim.isLimited("b", "k", 1, start)).toBe(false);
    // A rejected call late in the window must NOT record a hit — otherwise it
    // would push the window forward and keep the key blocked past start+WINDOW.
    const late = start + WINDOW - 1;
    expect(lim.isLimited("b", "k", 1, late)).toBe(true);
    // At start+WINDOW the original hit (at `start`) is at the cutoff boundary
    // (ts > cutoff is false) and drops → allowed again. If the rejected `late`
    // call had been recorded, that hit (> cutoff) would keep the key blocked and
    // this assertion would FAIL — so this now catches a window-extension mutant.
    expect(lim.isLimited("b", "k", 1, start + WINDOW)).toBe(false);
  });
});
