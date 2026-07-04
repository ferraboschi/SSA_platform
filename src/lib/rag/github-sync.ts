import "server-only";

// GitHub knowledge-base sync — mirrors the Obsidian sake wiki (private repo
// ferraboschi/obsidian-sake) into the pgvector corpus (rag_documents +
// rag_chunks), next to the Dropbox-ingested course material.
//
// Replace-by-source: only rows whose source starts with "github:" are ever
// deleted and rewritten — the existing Dropbox corpus ('dropbox:…' /
// 'shared:…') is never touched. Writes go through the service client directly
// because SupabaseVectorStore.upsert stays intentionally disabled (it protects
// the corpus from accidental in-app ingestion; this module is the one audited
// write path, mirroring scripts/rag-ingest.py's schema exactly).

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { chunkDocument } from "./chunking";
import { getEmbeddingProvider } from "./embeddings";
import type { RagDocument } from "./types";

/** settings_kv key of the last-sync record ({at, repo, branch, paths, docs, chunks, skipped}). */
export const KB_SYNC_LOG_KEY = "kb-sync-log";

const DEFAULT_REPO = "ferraboschi/obsidian-sake";
const DEFAULT_BRANCH = "main";
const DEFAULT_PATHS = "Concetti";

/** Vault notes above this size are almost certainly binary-ish dumps — skip. */
const MAX_FILE_BYTES = 200 * 1024;
/** Cleaned docs shorter than this carry no signal worth embedding. */
const MIN_DOC_CHARS = 80;
/** Same batch sizes as scripts/rag-ingest.py (OpenAI + PostgREST comfort). */
const EMBED_BATCH = 96;
const INSERT_BATCH = 50;
/** Be gentle with the GitHub contents API. */
const DOWNLOAD_CONCURRENCY = 4;
/** The pgvector corpus is text-embedding-3-small — anything else would poison it. */
const CORPUS_DIMENSIONS = 1536;

export interface KbSyncOutcome {
  ok: boolean;
  docs: number;
  chunks: number;
  skipped: number;
  /** Docs stored with family "generale" because the DB still has the legacy
   *  family CHECK (pre-sections migration). Their real section stays in
   *  metadata.section; re-sync after the migration to restore it. */
  familyFallback?: number;
  error?: string;
}

export interface CleanedNote {
  /** Embedding-ready text (frontmatter/wikilink/image markup removed). */
  text: string;
  /** Slugified frontmatter `section:` value, when present. */
  section: string | null;
}

/** Lowercase slug for the family column ("Schede prodotto" → "schede-prodotto"). */
export function slugifySection(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    // Drop the combining marks NFKD split off (à → a + U+0300).
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** KB section from the file's TOP-LEVEL vault folder; root files → "generale". */
export function sectionFromPath(path: string): string {
  const slash = path.indexOf("/");
  if (slash <= 0) return "generale";
  return slugifySection(path.slice(0, slash)) || "generale";
}

/**
 * Strip Obsidian/markdown syntax that would pollute the embeddings while
 * keeping every word of prose (headings keep their text, aliased wikilinks
 * keep their label). Pure — exported for unit tests.
 */
export function cleanObsidianMarkdown(raw: string): CleanedNote {
  let text = raw.replace(/\r\n/g, "\n");
  let section: string | null = null;

  // YAML frontmatter: read the optional `section:` value, then drop the block.
  const fm = text.match(/^---\n([\s\S]*?)\n---(\n|$)/);
  if (fm) {
    const line = fm[1].match(/^section:\s*["']?([^"'\n]+?)["']?\s*$/im);
    if (line) section = slugifySection(line[1]) || null;
    text = text.slice(fm[0].length);
  }

  text = text
    // Obsidian embeds (![[file]]) carry no prose — drop them entirely.
    .replace(/!\[\[[^\]]*\]\]/g, "")
    // Wikilinks: keep the label when aliased, else the target text.
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    // Markdown images add nothing to a text embedding.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Headings: keep the text, drop the marker.
    .replace(/^#{1,6}\s+/gm, "")
    // Collapse blank-line runs so chunking sees clean paragraph breaks.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, section };
}

// ---- GitHub API ----

interface GitTreeEntry {
  path?: string;
  type?: string;
  size?: number;
}

/** A prefix matches a whole folder or an exact file path. */
function matchesPrefixes(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

// Env-overridable base URL with a fallback to the real endpoint (AGENTS.md
// convention) — leave GITHUB_API_URL unset in normal use.
function githubApiBase(): string {
  return process.env.GITHUB_API_URL || "https://api.github.com";
}

function githubHeaders(token: string, raw: boolean): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Sync the Obsidian wiki (GitHub) into rag_documents/rag_chunks, replacing all
 * previous "github:" documents. Requires KB_GITHUB_TOKEN (private repo) and
 * EMBEDDINGS_API_KEY (stub vectors must never reach the corpus).
 */
export async function syncKbFromGitHub(): Promise<KbSyncOutcome> {
  const fail = (error: string): KbSyncOutcome => ({ ok: false, docs: 0, chunks: 0, skipped: 0, error });

  const token = process.env.KB_GITHUB_TOKEN;
  if (!token) {
    return fail("KB_GITHUB_TOKEN mancante: serve un token GitHub (repository privato) per sincronizzare la KB.");
  }
  // Without the real embeddings key the provider falls back to a 256-dim stub:
  // persisting those vectors would poison the 1536-dim corpus. Refuse.
  if (!process.env.EMBEDDINGS_API_KEY) {
    return fail(
      "EMBEDDINGS_API_KEY mancante: senza embeddings reali (1536 dimensioni) la sincronizzazione scriverebbe vettori stub incompatibili con il corpus.",
    );
  }
  const provider = getEmbeddingProvider();
  // Defence in depth: the provider is cached, so it may still be the stub even
  // with the key set (or a test override). Never persist non-corpus vectors.
  if (provider.dimensions !== CORPUS_DIMENSIONS) {
    return fail("Provider embeddings non valido (dimensioni diverse da 1536): sincronizzazione annullata.");
  }

  const repo = process.env.KB_GITHUB_REPO || DEFAULT_REPO;
  const branch = process.env.KB_GITHUB_BRANCH || DEFAULT_BRANCH;
  const prefixes = (process.env.KB_GITHUB_PATHS || DEFAULT_PATHS)
    .split(",")
    .map((p) => p.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);

  try {
    // 1) List the repo tree and keep the markdown notes under the prefixes.
    const treeRes = await fetch(
      `${githubApiBase()}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers: githubHeaders(token, false) },
    );
    if (!treeRes.ok) {
      return fail(`GitHub ha risposto ${treeRes.status} leggendo l'albero di ${repo}@${branch} (token o permessi?).`);
    }
    const treeBody = (await treeRes.json()) as { tree?: GitTreeEntry[] };

    let skipped = 0;
    const paths: string[] = [];
    for (const entry of treeBody.tree ?? []) {
      if (entry.type !== "blob" || !entry.path || !entry.path.endsWith(".md")) continue;
      if (!matchesPrefixes(entry.path, prefixes)) continue;
      if ((entry.size ?? 0) > MAX_FILE_BYTES) {
        skipped++;
        continue;
      }
      paths.push(entry.path);
    }

    // 2) Download + clean, small concurrency (single-threaded cursor is safe).
    const notes: { path: string; text: string; section: string }[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < paths.length) {
        const path = paths[cursor++];
        const url =
          `${githubApiBase()}/repos/${repo}/contents/` +
          `${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
        let raw: string;
        try {
          const res = await fetch(url, { headers: githubHeaders(token, true) });
          if (!res.ok) {
            skipped++;
            continue;
          }
          raw = await res.text();
        } catch {
          skipped++;
          continue;
        }
        const cleaned = cleanObsidianMarkdown(raw);
        if (cleaned.text.length < MIN_DOC_CHARS) {
          skipped++;
          continue;
        }
        notes.push({ path, text: cleaned.text, section: cleaned.section ?? sectionFromPath(path) });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, paths.length) }, worker),
    );

    const svc = getSupabaseServiceClient();

    // 3) Replace-by-source: wipe ONLY previous github: documents (+ their
    //    chunks). The Dropbox/shared corpus must survive untouched.
    const { data: oldDocs, error: oldErr } = await svc
      .from("rag_documents")
      .select("id")
      .like("source", "github:%");
    if (oldErr) return fail(`Lettura dei documenti GitHub esistenti fallita: ${oldErr.message}`);
    const oldIds = ((oldDocs ?? []) as { id: number }[]).map((d) => d.id);
    if (oldIds.length > 0) {
      const { error: delChunksErr } = await svc.from("rag_chunks").delete().in("document_id", oldIds);
      if (delChunksErr) return fail(`Pulizia dei chunk GitHub precedenti fallita: ${delChunksErr.message}`);
      const { error: delDocsErr } = await svc.from("rag_documents").delete().in("id", oldIds);
      if (delDocsErr) return fail(`Pulizia dei documenti GitHub precedenti fallita: ${delDocsErr.message}`);
    }

    // 4) Insert each note: document row → chunk (same chunker as the corpus)
    //    → embed in batches → chunk rows (embedding as pgvector string).
    let docCount = 0;
    let chunkCount = 0;
    let familyFallback = 0;
    for (const note of notes) {
      const fileName = note.path.split("/").pop() ?? note.path;
      const title = fileName.replace(/\.md$/i, "");
      const source = `github:${note.path}`;
      // The real section always travels in metadata: until the sections
      // migration drops the legacy family CHECK ('certificato','shochu',
      // 'generale'), wiki sections get rejected and fall back to 'generale' —
      // a re-sync after the migration restores them from the same source.
      const doc = { source, title, metadata: { path: note.path, repo, section: note.section } };

      let { data: inserted, error: insErr } = await svc
        .from("rag_documents")
        .insert({ ...doc, family: note.section })
        .select("id")
        .single();
      if (insErr?.code === "23514" && note.section !== "generale") {
        familyFallback++;
        ({ data: inserted, error: insErr } = await svc
          .from("rag_documents")
          .insert({ ...doc, family: "generale" })
          .select("id")
          .single());
      }
      if (insErr || !inserted) {
        skipped++;
        continue;
      }
      const docId = (inserted as { id: number }).id;

      const ragDoc: RagDocument = { id: source, title, source, lang: "it", text: note.text };
      const chunks = chunkDocument(ragDoc);

      const rows: {
        document_id: number;
        chunk_index: number;
        content: string;
        embedding: string;
        metadata: { title: string };
      }[] = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const vectors = await provider.embed(batch.map((c) => c.text));
        batch.forEach((chunk, j) => {
          rows.push({
            document_id: docId,
            chunk_index: chunk.index,
            content: chunk.text,
            embedding: `[${vectors[j].join(",")}]`,
            metadata: { title },
          });
        });
      }
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const { error: rowErr } = await svc.from("rag_chunks").insert(rows.slice(i, i + INSERT_BATCH));
        if (rowErr) return fail(`Inserimento dei chunk fallito («${title}»): ${rowErr.message}`);
      }

      docCount++;
      chunkCount += rows.length;
    }

    // 5) Record the sync (single settings_kv row, same mechanism as the
    //    exam-link send log). The sync already succeeded — never fail over it.
    try {
      await svc.from("settings_kv").upsert(
        {
          key: KB_SYNC_LOG_KEY,
          value: {
            at: new Date().toISOString(),
            repo,
            branch,
            paths: prefixes,
            docs: docCount,
            chunks: chunkCount,
            skipped,
            familyFallback,
          },
        },
        { onConflict: "key" },
      );
    } catch {
      /* log only */
    }

    return { ok: true, docs: docCount, chunks: chunkCount, skipped, familyFallback };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Sincronizzazione non riuscita.");
  }
}
