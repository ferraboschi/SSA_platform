import "server-only";

// Wires the RAG pipeline to the live, persistent corpus at request time (lazy —
// not at module load, to stay build/edge-safe). Call ensureRagWired() before any
// grounded grading.

import { setVectorStore } from "./store";
import { SupabaseVectorStore } from "./supabase-store";

let wired = false;

/**
 * Point retrieval at the persistent pgvector corpus — but ONLY when both the
 * service key and LIVE embeddings are configured. Without live embeddings the
 * query vector would be the 256-dim stub, which can't match the stored 1536-dim
 * vectors; in that case we keep the empty in-memory store so the grader REFUSES
 * (returns no citations) rather than mis-retrieving against the wrong space.
 */
export function ensureRagWired(): void {
  if (wired) return;
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasEmbeddings = Boolean(process.env.EMBEDDINGS_API_KEY);
  if (hasService && hasEmbeddings) {
    setVectorStore(new SupabaseVectorStore());
  }
  wired = true;
}

/** Diagnostic: which grounding prerequisites are present in this environment. */
export function ragGroundingStatus(): {
  service: boolean;
  embeddings: boolean;
  anthropic: boolean;
  grounded: boolean;
} {
  const service = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const embeddings = Boolean(process.env.EMBEDDINGS_API_KEY);
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  return { service, embeddings, anthropic, grounded: service && embeddings && anthropic };
}
