// Supabase — Postgres + Auth + Storage + pgvector (RAG).
//
// Public entry: safe to import from BOTH client and server code. Holds the
// config seam + a configured() check.
//
// Server-only clients (createServerClient/service-role) live in ./server.ts
// because they import next/headers; importing them from this file would
// contaminate client bundles.

import { supabaseConfig } from "../config";

export { supabaseConfig };

export function isSupabaseConfigured(): boolean {
  return supabaseConfig.isConfigured;
}
