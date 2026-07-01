// ============================================================================
// Repo context — the per-request Supabase clients shared by every repository.
//
// `sb` is the request-bound server client (reads, RLS-scoped); `svc` is the
// service client (mutations that bypass RLS). Both are created ONCE per
// createSupabaseDataSource() call in ./index.ts and passed to each repo factory
// via this object, preserving the original request-scoping exactly.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient;

export type RepoContext = {
  sb: DB;
  svc: DB;
};
