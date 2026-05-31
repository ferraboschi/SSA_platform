// Embeddings — pluggable provider. Live mode calls an OpenAI-compatible
// embeddings endpoint; unconfigured, a deterministic hashing stub keeps the
// pipeline fully functional offline (retrieval is approximate but stable).

import type { EmbeddingVector } from "./types";

export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: string[]): Promise<EmbeddingVector[]>;
}

// ---- Deterministic stub (no network) ----
// Hashes tokens into a fixed-width bag-of-words vector, then L2-normalises.
// Same text → same vector, and lexical overlap → higher cosine similarity.

const STUB_DIMS = 256;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function normalise(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return mag === 0 ? v : v.map((x) => x / mag);
}

class StubEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = STUB_DIMS;
  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => {
      const vec = new Array(STUB_DIMS).fill(0);
      for (const token of tokenize(text)) {
        vec[hashToken(token) % STUB_DIMS] += 1;
      }
      return normalise(vec);
    });
  }
}

// ---- Live provider (OpenAI-compatible REST) ----

class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  constructor(
    private apiKey: string,
    private model: string,
    dimensions: number,
  ) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`Embeddings request failed (${res.status})`);
    }
    const data = (await res.json()) as {
      data: { embedding: number[] }[];
    };
    return data.data.map((d) => d.embedding);
  }
}

let instance: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!instance) {
    const apiKey = process.env.EMBEDDINGS_API_KEY;
    if (apiKey) {
      const model = process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small";
      instance = new OpenAiEmbeddingProvider(apiKey, model, 1536);
    } else {
      instance = new StubEmbeddingProvider();
    }
  }
  return instance;
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  instance = provider;
}
