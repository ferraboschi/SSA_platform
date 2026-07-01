import { describe, it, expect } from "vitest";
import { signShareToken, verifyShareToken, type ShareTokenPayload } from "./token";

const future = Math.floor(Date.now() / 1000) + 3600;
const base: ShareTokenPayload = { c: "42", e: future };

describe("share-link tokens (HMAC, signed + expiring)", () => {
  it("round-trips a payload through sign → verify", () => {
    const tok = signShareToken(base);
    const res = verifyShareToken(tok);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toEqual(base);
  });

  it("rejects a tampered body (bad signature)", () => {
    const tok = signShareToken(base);
    const [body, mac] = tok.split(".");
    // Flip a character in the body; the MAC no longer matches.
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    const res = verifyShareToken(`${flipped}.${mac}`);
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered signature", () => {
    const tok = signShareToken(base);
    const [body] = tok.split(".");
    const res = verifyShareToken(`${body}.deadbeef`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("bad-signature");
  });

  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const res = verifyShareToken(signShareToken({ ...base, e: past }));
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a malformed token (no dot / junk)", () => {
    expect(verifyShareToken("not-a-token")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyShareToken("a.b.c")).toEqual({ ok: false, reason: "malformed" });
  });

  it("two tokens for different courses are not interchangeable", () => {
    const a = signShareToken(base);
    const b = signShareToken({ ...base, c: "99" });
    expect(a).not.toBe(b);
    const ra = verifyShareToken(a);
    expect(ra.ok && ra.payload.c).toBe("42");
  });
});
