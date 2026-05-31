import "server-only";

// Server-only Supabase clients. Importing next/headers (or any server-only API)
// from the public Supabase entry point would contaminate client bundles —
// keep that surface SSR-pure by routing all server access through this file.

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseConfig } from "../config";

/**
 * Server-side client bound to the current request's cookies.
 * Auto-refreshes the user session into the response cookies.
 */
export async function getSupabaseServerClient() {
  if (!supabaseConfig.isConfigured) {
    throw new Error("Supabase is not configured.");
  }
  const cookieStore = await cookies();
  return createServerClient(supabaseConfig.url!, supabaseConfig.anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(updates) {
        try {
          for (const { name, value, options } of updates) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — Next forbids cookie writes there.
          // Token refreshes are written by middleware instead; safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client — BYPASSES Row Level Security. Use only from trusted
 * server code (migrations, imports, cron jobs, RAG ingestion). Never expose
 * its key to the browser.
 */
export function getSupabaseServiceClient() {
  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    throw new Error(
      "Supabase service role is not configured (set SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
