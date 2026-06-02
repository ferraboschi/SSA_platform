// Signed, expiring "share with educator" tokens. Server-only.
//
// A token encodes a single course id + an expiry, signed with HMAC-SHA256 so it
// cannot be forged. No DB row needed — the link IS the read-only grant. Same
// design as the exam links (stateless, revocation = short TTL).
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ShareTokenPayload {
  /** Course id being shared. */
  c: string;
  /** Expiry, epoch seconds. */
  e: number;
}

/** Default lifetime: educators keep the link for the run-up to the course. */
export const SHARE_LINK_TTL_HOURS = 24 * 30; // 30 days

function secret(): string {
  return (
    process.env.SHARE_LINK_SECRET ||
    process.env.EXAM_LINK_SECRET ||
    process.env.SYNC_SECRET ||
    "ssa-dev-share-secret-do-not-use-in-prod"
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

export function signShareToken(payload: ShareTokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export type ShareVerifyResult =
  | { ok: true; payload: ShareTokenPayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

export function verifyShareToken(token: string): ShareVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, mac] = parts;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload: ShareTokenPayload;
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
