// Signed, expiring exam-link tokens. Server-only.
//
// A token encodes which course + which test (final / day-N / feedback), the
// mode (real exam vs test-preview), an optional forced language, and an expiry.
// It is signed with HMAC-SHA256 so it cannot be forged or tampered, and it is
// NOT permanent — every link carries its own `exp`. No DB row needed: the link
// IS the grant. Stateless by design (revocation = short TTL).
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type ExamTestKey = "final" | "feedback" | `day${number}`;
// "exam" = real student session; "test" = preview; "validate" = full run-through
// that reveals correct answers (to validate the exam content + the software).
export type ExamLinkMode = "exam" | "test" | "validate";

export interface ExamTokenPayload {
  /** Course id the exam belongs to. */
  c: string;
  /** Which test within the template. */
  t: ExamTestKey;
  /** "exam" = real student session, "test" = preview (no real submission). */
  m: ExamLinkMode;
  /** Optional forced language (else the student picks). */
  l?: string;
  /** Expiry, epoch seconds. */
  e: number;
}

function secret(): string {
  return (
    process.env.EXAM_LINK_SECRET ||
    process.env.SYNC_SECRET ||
    "ssa-dev-exam-secret-do-not-use-in-prod"
  );
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(body).digest());
}

/** Build a signed token string from a payload. */
export function signExamToken(payload: ExamTokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: ExamTokenPayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

/** Verify signature + expiry and return the decoded payload. */
export function verifyExamToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, mac] = parts;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload: ExamTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.e !== "number" || payload.e * 1000 < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/** Default lifetimes (hours). Real exam links are short; previews a bit longer. */
export const EXAM_LINK_TTL_HOURS: Record<ExamLinkMode, number> = {
  exam: 12,
  test: 72,
  validate: 72,
};
