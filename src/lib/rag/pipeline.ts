// RAG pipeline — ingest (chunk → embed → store) and retrieve (embed query →
// nearest chunks). Backend-agnostic: uses whichever EmbeddingProvider and
// VectorStore are currently configured.

import { chunkDocument, type ChunkOptions } from "./chunking";
import { getEmbeddingProvider } from "./embeddings";
import { getVectorStore } from "./store";
import type { RagDocument, RetrievedChunk } from "./types";

export interface IngestResult {
  documents: number;
  chunks: number;
}

export async function ingestDocuments(
  docs: RagDocument[],
  options?: ChunkOptions,
): Promise<IngestResult> {
  const provider = getEmbeddingProvider();
  const store = getVectorStore();

  const chunks = docs.flatMap((doc) => chunkDocument(doc, options));
  if (chunks.length === 0) return { documents: docs.length, chunks: 0 };

  const vectors = await provider.embed(chunks.map((c) => c.text));
  await store.upsert(
    chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i] })),
  );

  return { documents: docs.length, chunks: chunks.length };
}

export async function retrieve(
  query: string,
  k = 4,
  /** Optional KB-section constraint, passed through to the store untouched. */
  filter?: { family?: string },
): Promise<RetrievedChunk[]> {
  const provider = getEmbeddingProvider();
  const store = getVectorStore();
  const [embedding] = await provider.embed([query]);
  return store.query(embedding, k, filter);
}
