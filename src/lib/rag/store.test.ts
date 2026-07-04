import { describe, it, expect } from "vitest";
import { InMemoryVectorStore } from "./store";
import type { EmbeddedChunk } from "./types";

// The in-memory store must honor the same family filter the pgvector store
// applies via match_rag_chunks' family_filter — chunks inherit the document
// metadata, so metadata.family is the section key.

function mkChunk(id: string, embedding: number[], family?: string): EmbeddedChunk {
  return {
    id,
    docId: `doc-${id}`,
    index: 0,
    text: `text of ${id}`,
    title: `title of ${id}`,
    source: "test",
    lang: "it",
    ...(family ? { metadata: { family } } : {}),
    embedding,
  };
}

async function seeded(): Promise<InMemoryVectorStore> {
  const store = new InMemoryVectorStore();
  await store.upsert([
    mkChunk("a1", [1, 0], "produzione"),
    mkChunk("a2", [0.9, 0.1], "produzione"),
    mkChunk("b1", [0, 1], "degustazione"),
    mkChunk("n1", [0.5, 0.5]), // no metadata at all
  ]);
  return store;
}

describe("InMemoryVectorStore family filter", () => {
  it("without a filter searches the whole corpus (behavior unchanged)", async () => {
    const store = await seeded();
    const hits = await store.query([1, 0], 10);
    expect(hits.map((h) => h.chunk.id).sort()).toEqual(["a1", "a2", "b1", "n1"]);
    // Best cosine match first.
    expect(hits[0].chunk.id).toBe("a1");
  });

  it("restricts results to the requested family", async () => {
    const store = await seeded();
    const hits = await store.query([1, 0], 10, { family: "produzione" });
    expect(hits.map((h) => h.chunk.id).sort()).toEqual(["a1", "a2"]);
  });

  it("excludes chunks with no metadata when a family is requested", async () => {
    const store = await seeded();
    const hits = await store.query([0.5, 0.5], 10, { family: "degustazione" });
    expect(hits.map((h) => h.chunk.id)).toEqual(["b1"]);
  });

  it("returns nothing for an unknown family (grader then refuses)", async () => {
    const store = await seeded();
    const hits = await store.query([1, 0], 10, { family: "storia" });
    expect(hits).toEqual([]);
  });

  it("treats an empty filter object like no filter", async () => {
    const store = await seeded();
    const hits = await store.query([1, 0], 10, {});
    expect(hits).toHaveLength(4);
  });

  it("still applies the k cut after filtering", async () => {
    const store = await seeded();
    const hits = await store.query([1, 0], 1, { family: "produzione" });
    expect(hits.map((h) => h.chunk.id)).toEqual(["a1"]);
  });
});
