// PURE helper for the "Correzione AI" health probe: turns an embeddings-provider
// error message into a short, human, non-secret reason for the dashboard chip
// and /api/health. Kept free of server-only imports so it is unit-testable.
//
// The embeddings provider throws "Embeddings request failed (429)" (legacy) or
// "Embeddings request failed (429 insufficient_quota)" (with the OpenAI error
// code): both shapes must map to the same reason.

/** Upper bound for a pass-through message (keeps the chip readable). */
export const EMBEDDING_ERROR_MAX_CHARS = 80;

/** Shown when the provider throws with no message at all. */
const UNKNOWN_EMBEDDING_ERROR = "errore embeddings sconosciuto";

/**
 * Describe an Anthropic (Claude) error for humans — same posture as the
 * embeddings one. The client throws "Anthropic <status>: <body>"; a drained
 * account is a 400 whose body says "credit balance is too low".
 */
export function describeAnthropicError(message: string): string {
  const raw = (message ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("credit balance") || lower.includes("billing")) {
    return "crediti Anthropic esauriti";
  }
  if (/\b(401|403)\b/.test(lower) || lower.includes("authentication")) {
    return "chiave Anthropic non valida";
  }
  if (/\b429\b/.test(lower)) return "limite di richieste Anthropic (429)";
  if (/\b(529|503)\b/.test(lower) || lower.includes("overloaded")) return "Anthropic sovraccarico";
  if (!raw) return "errore Anthropic sconosciuto";
  return raw.replace(/\bsk-[\w-]{8,}/g, "sk-…").slice(0, EMBEDDING_ERROR_MAX_CHARS);
}

/**
 * Describe an embeddings error for humans. Never echoes credentials: the input
 * is an error message (not a request/response body), and any `sk-…` looking
 * token is masked defensively before the text can reach the UI.
 */
export function describeEmbeddingError(message: string): string {
  const raw = (message ?? "").trim();
  const lower = raw.toLowerCase();
  if (/\b429\b/.test(lower) && /rate[_ ]?limit/.test(lower)) {
    return "limite di richieste OpenAI (429)";
  }
  if (/\b429\b/.test(lower) || lower.includes("quota")) {
    return "crediti OpenAI esauriti (429)";
  }
  if (/\b(401|403)\b/.test(lower)) {
    return "chiave embeddings non valida";
  }
  if (!raw) return UNKNOWN_EMBEDDING_ERROR;
  return raw.replace(/\bsk-[\w-]{8,}/g, "sk-…").slice(0, EMBEDDING_ERROR_MAX_CHARS);
}
