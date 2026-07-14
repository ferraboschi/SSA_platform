import "server-only";

// pgvector-backed vector store (Supabase). Queries the ingested SSA knowledge
// base via the `match_rag_chunks` RPC (cosine similarity over rag_chunks). The
// corpus is ingested out-of-band by scripts/rag-ingest.py, so upsert/clear are
// intentionally disabled here (and `clear` would delete data — never do that).

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { VectorStore } from "./store";
import type { EmbeddedChunk, EmbeddingVector, RetrievedChunk } from "./types";

interface MatchRow {
  id: number;
  document_id: number;
  content: string;
  similarity: number;
}

export class SupabaseVectorStore implements VectorStore {
  async query(
    embedding: EmbeddingVector,
    k: number,
    filter?: { family?: string },
  ): Promise<RetrievedChunk[]> {
    try {
      const svc = getSupabaseServiceClient();
      // The deployed SQL already accepts family_filter (null = whole corpus).
      const { data, error } = await svc.rpc("match_rag_chunks", {
        query_embedding: embedding,
        match_count: k,
        family_filter: filter?.family ?? null,
      });
      if (error || !Array.isArray(data)) {
        // An RPC failure must be tellable apart from a genuinely empty corpus:
        // downstream this [] turns into "nessun contenuto pertinente" refusals.
        if (error) console.error("[rag] match_rag_chunks failed:", error.message);
        return [];
      }
      const rows = data as MatchRow[];
      if (!rows.length) return [];

      // Best-effort: resolve document titles/sources for citation display.
      const docIds = [...new Set(rows.map((r) => r.document_id))];
      const meta = new Map<number, { title: string; source: string }>();
      const { data: docs } = await svc
        .from("rag_documents")
        .select("id, title, source")
        .in("id", docIds);
      for (const d of (docs ?? []) as Array<{ id: number; title: string; source: string }>) {
        meta.set(d.id, { title: d.title, source: d.source });
      }

      return rows.map((r) => ({
        score: r.similarity,
        chunk: {
          id: String(r.id),
          docId: String(r.document_id),
          index: 0,
          text: r.content,
          title: meta.get(r.document_id)?.title ?? "SSA knowledge base",
          source: meta.get(r.document_id)?.source ?? "supabase:rag_chunks",
          lang: "it",
        },
      }));
    } catch {
      // Any failure → no citations → the grader refuses (never hallucinate).
      return [];
    }
  }

  async count(): Promise<number> {
    try {
      const svc = getSupabaseServiceClient();
      const { count } = await svc
        .from("rag_chunks")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    } catch {
      return 0;
    }
  }

  async upsert(_chunks: EmbeddedChunk[]): Promise<void> {
    throw new Error("SupabaseVectorStore.upsert disabled — ingest via scripts/rag-ingest.py");
  }

  async clear(): Promise<void> {
    throw new Error("SupabaseVectorStore.clear disabled — never delete the corpus");
  }
}
