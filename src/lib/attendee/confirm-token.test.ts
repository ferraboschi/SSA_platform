import { describe, it, expect } from "vitest";
import {
  signConfirmToken,
  verifyConfirmToken,
  CONFIRM_LINK_TTL_HOURS,
} from "./confirm-token";

const future = Math.floor(Date.now() / 1000) + 3600;

describe("confirm-token", () => {
  it("round-trips a valid token", () => {
    const t = signConfirmToken({ c: "10", k: "corsista", i: "5", e: future });
    const r = verifyConfirmToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.c).toBe("10");
      expect(r.payload.k).toBe("corsista");
      expect(r.payload.i).toBe("5");
    }
  });

  it("rejects a tampered signature", () => {
    const t = signConfirmToken({ c: "10", k: "partecipante", i: "7", e: future });
    const [body] = t.split(".");
    const r = verifyConfirmToken(`${body}.deadbeefdeadbeef`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad-signature");
  });

  it("rejects a swapped payload kept with an old signature", () => {
    // Sign a token, then splice its MAC onto a DIFFERENT payload body → the
    // signature no longer covers the body, so verification must fail. This is
    // the exact "point a shared link at another course/student" attack.
    const legit = signConfirmToken({ c: "10", k: "corsista", i: "5", e: future });
    const mac = legit.split(".")[1];
    const otherBody = signConfirmToken({ c: "999", k: "corsista", i: "5", e: future }).split(".")[0];
    const r = verifyConfirmToken(`${otherBody}.${mac}`);
    expect(r.ok).toBe(false);
  });

  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const t = signConfirmToken({ c: "10", k: "corsista", i: "5", e: past });
    const r = verifyConfirmToken(t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects malformed tokens", () => {
    expect(verifyConfirmToken("garbage").ok).toBe(false);
    expect(verifyConfirmToken("a.b.c").ok).toBe(false);
    expect(verifyConfirmToken("").ok).toBe(false);
  });

  it("has a positive default TTL", () => {
    expect(CONFIRM_LINK_TTL_HOURS).toBeGreaterThan(0);
  });
});
