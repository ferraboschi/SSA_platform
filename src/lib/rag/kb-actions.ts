"use server";

// Knowledge-base maintenance actions — thin, role-guarded wrappers around the
// GitHub wiki sync (github-sync.ts). Server actions are POST endpoints not
// covered by the layout's login redirect, so they self-authorize (guard.ts).
//
// Conventions rule 7: this file exports ONLY async functions and inline
// type/interface declarations — never an export clause.

import { hasRole } from "@/lib/auth/guard";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { KB_SYNC_LOG_KEY, syncKbFromGitHub } from "./github-sync";

export interface KbSyncActionResult {
  ok: boolean;
  docs: number;
  chunks: number;
  skipped: number;
  error?: string;
}

/** Staff-triggered sync of the Obsidian sake wiki (GitHub) into the RAG corpus. */
export async function syncKbAction(): Promise<KbSyncActionResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, docs: 0, chunks: 0, skipped: 0, error: "Non autorizzato." };
  }
  return syncKbFromGitHub();
}

export interface KbStatusResult {
  ok: boolean;
  /** Documents synced from the GitHub wiki (source "github:…"). */
  githubDocs: number;
  /** Documents from every other ingest (Dropbox corpus etc.). */
  otherDocs: number;
  /** Total chunks in the corpus (all sources). */
  chunks: number;
  /** ISO timestamp of the last GitHub sync, from the settings_kv log. */
  lastSync: string | null;
}

/** Corpus counts + last GitHub sync, for the hub status line. Fails soft. */
export async function kbStatusAction(): Promise<KbStatusResult> {
  const empty: KbStatusResult = { ok: false, githubDocs: 0, otherDocs: 0, chunks: 0, lastSync: null };
  if (!(await hasRole(["admin", "manager"]))) return empty;
  try {
    const svc = getSupabaseServiceClient();
    const [gh, other, chunks, log] = await Promise.all([
      svc.from("rag_documents").select("id", { count: "exact", head: true }).like("source", "github:%"),
      svc.from("rag_documents").select("id", { count: "exact", head: true }).not("source", "like", "github:%"),
      svc.from("rag_chunks").select("id", { count: "exact", head: true }),
      svc.from("settings_kv").select("value").eq("key", KB_SYNC_LOG_KEY).maybeSingle(),
    ]);
    const at = (log.data?.value as { at?: string } | null | undefined)?.at;
    return {
      ok: true,
      githubDocs: gh.count ?? 0,
      otherDocs: other.count ?? 0,
      chunks: chunks.count ?? 0,
      lastSync: typeof at === "string" ? at : null,
    };
  } catch {
    // A transient error only hides the status line for one render.
    return empty;
  }
}
