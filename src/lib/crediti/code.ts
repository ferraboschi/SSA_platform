import { randomInt } from "node:crypto";

// One-time redemption code for a transfer credit (corsi_crediti.codice).
// Copied to the credit's owner; entered as the Shopify discount code on their new
// purchase; the sync then auto-matches it back to close the exact credit.
//
// Alphabet excludes visually ambiguous characters (no O/0, I/1/L) so a code
// dictated or hand-copied can't be mistyped. 10 chars from 30 symbols ≈ 5.9e14
// combinations, so collisions are negligible (and the DB unique index is the
// backstop).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCreditCode(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
