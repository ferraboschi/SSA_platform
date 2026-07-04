// Vector store — pluggable. Defaults to an in-memory cosine-similarity store;
// production swaps in a pgvector-backed store (Supabase) implementing the same
// interface, so ingest/retrieve code is unchanged.

import type { EmbeddedChunk, EmbeddingVector, RetrievedChunk } from "./types";

export interface VectorStore {
  upsert(chunks: EmbeddedChunk[]): Promise<void>;
  /** `filter.family` narrows retrieval to one KB section (rag_documents.family);
   *  omitted → the whole corpus, exactly as before the filter existed. */
  query(
    embedding: EmbeddingVector,
    k: number,
    filter?: { family?: string },
  ): Promise<RetrievedChunk[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class InMemoryVectorStore implements VectorStore {
  private chunks = new Map<string, EmbeddedChunk>();

  async upsert(chunks: EmbeddedChunk[]): Promise<void> {
    for (const c of chunks) this.chunks.set(c.id, c);
  }

  async query(
    embedding: EmbeddingVector,
    k: number,
    filter?: { family?: string },
  ): Promise<RetrievedChunk[]> {
    const scored: RetrievedChunk[] = [];
    for (const chunk of this.chunks.values()) {
      // Mirror the pgvector store's family_filter: chunks inherit the document
      // metadata, so metadata.family is the section key here.
      if (filter?.family && chunk.metadata?.family !== filter.family) continue;
      scored.push({ chunk, score: cosineSimilarity(embedding, chunk.embedding) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  async count(): Promise<number> {
    return this.chunks.size;
  }

  async clear(): Promise<void> {
    this.chunks.clear();
  }
}

let instance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!instance) {
    instance = new InMemoryVectorStore();
  }
  return instance;
}

export function setVectorStore(store: VectorStore): void {
  instance = store;
}
