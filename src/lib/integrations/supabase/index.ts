// Supabase — Postgres + Auth + Storage + pgvector (RAG).
//
// Public entry: safe to import from BOTH client and server code. Holds the
// config seam + the browser client + a configured() check.
//
// Server-only clients (createServerClient/service-role) live in ./server.ts
// because they import next/headers; importing them from this file would
// contaminate client bundles.

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "../config";

export { supabaseConfig };

export function isSupabaseConfigured(): boolean {
  return supabaseConfig.isConfigured;
}

export function getSupabaseBrowserClient() {
  if (!supabaseConfig.isConfigured) {
    throw new Error(
      "Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return createBrowserClient(supabaseConfig.url!, supabaseConfig.anonKey!);
}
