// Signed, expiring "confirm your details" magic-link tokens. Server-only.
//
// A token binds ONE attendee (a corsista enrollment OR a companion) on ONE course
// to a self-service confirmation page. Like the exam links (exam-links/token.ts)
// it is HMAC-SHA256 signed and stateless — the link IS the grant, revocation = a
// short TTL. No DB row needed to open the page (the write it performs is
// service-role, course-scoped, and derived from the verified token).
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type ConfirmSubjectKind = "corsista" | "partecipante";

export interface ConfirmTokenPayload {
  /** Course id. */
  c: string;
  /** Subject kind: an enrolled corsista or a "doppio" companion. */
  k: ConfirmSubjectKind;
  /** Subject id — corsi_iscrizioni.id (corsista) or corsi_partecipanti.id. */
  i: string;
  /** Optional forced language for the page. */
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

/** Default confirmation-link lifetime: covers course start + a day or two of
 *  stragglers. The educator can always re-send (a fresh token). */
export const CONFIRM_LINK_TTL_HOURS = 72;

export function signConfirmToken(payload: ConfirmTokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export type VerifyConfirmResult =
  | { ok: true; payload: ConfirmTokenPayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

export function verifyConfirmToken(token: string): VerifyConfirmResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, mac] = parts;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload: ConfirmTokenPayload;
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
