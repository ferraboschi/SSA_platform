import { describe, it, expect } from "vitest";
import { describeAnthropicError, describeEmbeddingError, EMBEDDING_ERROR_MAX_CHARS } from "./health-describe";

// The pure half of the "Correzione AI" health probe. The embeddings provider
// throws two message shapes — legacy "(429)" and "(429 insufficient_quota)" —
// and both must land on the same human reason for the dashboard chip.

describe("describeEmbeddingError", () => {
  it("maps a 429 to exhausted credits — legacy message (status only)", () => {
    expect(describeEmbeddingError("Embeddings request failed (429)")).toBe(
      "crediti OpenAI esauriti (429)",
    );
  });

  it("maps a 429 to exhausted credits — message with the OpenAI error code", () => {
    expect(describeEmbeddingError("Embeddings request failed (429 insufficient_quota)")).toBe(
      "crediti OpenAI esauriti (429)",
    );
  });

  it("maps any 'quota' wording to exhausted credits even without a status", () => {
    expect(describeEmbeddingError("You exceeded your current QUOTA, check billing")).toBe(
      "crediti OpenAI esauriti (429)",
    );
  });

  it("distinguishes a rate-limit 429 from an exhausted-credits 429", () => {
    expect(describeEmbeddingError("Embeddings request failed (429 rate_limit_exceeded)")).toBe(
      "limite di richieste OpenAI (429)",
    );
    expect(describeEmbeddingError("429 Rate limit reached for requests")).toBe(
      "limite di richieste OpenAI (429)",
    );
  });

  it("maps 401/403 to an invalid key", () => {
    expect(describeEmbeddingError("Embeddings request failed (401)")).toBe(
      "chiave embeddings non valida",
    );
    expect(describeEmbeddingError("Embeddings request failed (403 forbidden)")).toBe(
      "chiave embeddings non valida",
    );
  });

  it("does not confuse digits inside longer numbers/ids with a status code", () => {
    expect(describeEmbeddingError("request req_14290abc failed")).toBe(
      "request req_14290abc failed",
    );
    expect(describeEmbeddingError("row 4010 missing")).toBe("row 4010 missing");
  });

  it("passes an unknown message through, trimmed and capped", () => {
    expect(describeEmbeddingError("  fetch failed  ")).toBe("fetch failed");
    const long = "x".repeat(200);
    expect(describeEmbeddingError(long)).toHaveLength(EMBEDDING_ERROR_MAX_CHARS);
    expect(describeEmbeddingError("timeout embeddings (10s)")).toBe("timeout embeddings (10s)");
  });

  it("never yields an empty reason", () => {
    expect(describeEmbeddingError("")).toBe("errore embeddings sconosciuto");
    expect(describeEmbeddingError("   ")).toBe("errore embeddings sconosciuto");
  });

  it("masks anything that looks like an API key before it can reach the UI", () => {
    const out = describeEmbeddingError("Unexpected: key sk-proj-ABCDEFGHIJKLMNOP1234 rejected");
    expect(out).not.toContain("sk-proj-ABCDEFGHIJKLMNOP1234");
    expect(out).toContain("sk-…");
  });
});

describe("describeAnthropicError", () => {
  it("maps a drained account (400 credit balance) to the owner-facing reason", () => {
    expect(
      describeAnthropicError(
        'Anthropic 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      ),
    ).toBe("crediti Anthropic esauriti");
  });
  it("maps auth, rate-limit and overload statuses", () => {
    expect(describeAnthropicError("Anthropic 401: authentication_error")).toBe("chiave Anthropic non valida");
    expect(describeAnthropicError("Anthropic 429: rate_limit_error")).toBe("limite di richieste Anthropic (429)");
    expect(describeAnthropicError("Anthropic 529: overloaded_error")).toBe("Anthropic sovraccarico");
  });
  it("passes other messages through, trimmed and never empty", () => {
    expect(describeAnthropicError("timeout Anthropic (10s)")).toBe("timeout Anthropic (10s)");
    expect(describeAnthropicError("")).toBe("errore Anthropic sconosciuto");
  });
});
