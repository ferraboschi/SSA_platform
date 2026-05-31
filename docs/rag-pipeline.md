# RAG pipeline — assisted exam grading

Knowledge base on sake used to **assist** (never replace) educators when grading
open-ended exam answers (`ExamQuestion.type === "open"`, identified by `aiKey`).
The suggestion is always advisory; a human confirms or overrides.

Code: `src/lib/rag/`.

## Stages

```
documents ─► chunk ─► embed ─► vector store          (ingest, offline/batch)
                                     │
question + answer ─► embed query ─► retrieve top-k ─► grading model ─► suggestion
```

1. **Ingest** (`pipeline.ts › ingestDocuments`)
   - Sources: course manuals, tasting notes, the sake catalog, files synced from
     Dropbox (`/SSA/kb/...`). Anything reducible to `RagDocument { text, lang, … }`.
   - `chunking.ts` splits each document into overlapping, paragraph-aware windows
     (~900 chars, 150 overlap).
   - `embeddings.ts` turns chunks into vectors.
   - `store.ts` persists `EmbeddedChunk`s.

2. **Retrieve** (`pipeline.ts › retrieve`)
   - Embeds the query (question + `aiKey`) and returns the top-k chunks by cosine
     similarity.

3. **Grade** (`grading.ts › gradeOpenAnswer`)
   - Retrieves context, passes it with the question + student answer to a
     `GradingModel`, and returns a `GradeSuggestion` — `suggestedPoints`,
     `confidence`, `rationale`, and the `citations` it was grounded in.

## Swappable seams (extension points)

| Seam | Interface | Default (offline) | Production |
|------|-----------|-------------------|------------|
| Embeddings | `EmbeddingProvider` | deterministic hashing stub | OpenAI-compatible (`EMBEDDINGS_API_KEY`) |
| Vector store | `VectorStore` | `InMemoryVectorStore` (cosine) | pgvector on Supabase |
| Grading | `GradingModel` | lexical-overlap heuristic stub | LLM grader (e.g. Claude) |

Each has a `getX()` / `setX()` pair; swap implementations without touching
callers. With no env configured the whole pipeline runs offline so the exam
module is testable end-to-end before any external service is wired.

## Configuration

```
EMBEDDINGS_API_KEY=     # enables live embeddings; absent → stub
EMBEDDINGS_MODEL=text-embedding-3-small
```

Vector persistence (pgvector) and the live LLM grader are wired where the table
notes "Production". Until then the in-memory store is rebuilt per process via
`ingestDocuments`.

## Human-in-the-loop

`GradeSuggestion.provider` flags `"model"` vs `"stub"`, and `confidence` is
surfaced in the grading UI. Educators see the cited passages and the suggested
score; the recorded grade is the educator's decision, not the model's.
