import { describe, it, expect } from "vitest";
import { signExamToken, verifyExamToken, type ExamTokenPayload } from "./token";

const future = Math.floor(Date.now() / 1000) + 3600;
const base: ExamTokenPayload = { c: "42", t: "final", m: "exam", e: future };

describe("exam-link tokens (HMAC, signed + expiring)", () => {
  it("round-trips a payload through sign → verify", () => {
    const tok = signExamToken(base);
    const res = verifyExamToken(tok);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toEqual(base);
  });

  it("preserves all optional fields (lang, student id)", () => {
    const full: ExamTokenPayload = { ...base, l: "ja", s: "1001" };
    const res = verifyExamToken(signExamToken(full));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload).toEqual(full);
  });

  it("rejects a tampered body (bad signature)", () => {
    const tok = signExamToken(base);
    const [body, mac] = tok.split(".");
    // Flip a character in the body; the MAC no longer matches.
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    const res = verifyExamToken(`${flipped}.${mac}`);
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered signature", () => {
    const tok = signExamToken(base);
    const [body] = tok.split(".");
    const res = verifyExamToken(`${body}.deadbeef`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("bad-signature");
  });

  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const res = verifyExamToken(signExamToken({ ...base, e: past }));
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a malformed token (no dot / junk)", () => {
    expect(verifyExamToken("not-a-token")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyExamToken("a.b.c")).toEqual({ ok: false, reason: "malformed" });
  });

  it("two tokens for different courses are not interchangeable", () => {
    const a = signExamToken(base);
    const b = signExamToken({ ...base, c: "99" });
    expect(a).not.toBe(b);
    const ra = verifyExamToken(a);
    expect(ra.ok && ra.payload.c).toBe("42");
  });
});
