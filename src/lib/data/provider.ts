import "server-only";

// DataSource provider — the single seam where the backend is selected.
//
// The rest of the app calls `getDataSource()` and never imports a concrete
// adapter. Selection order:
//
//   1. setDataSource()      — explicit override (tests, custom wiring).
//   2. Supabase adapter     — when USE_SEED=false AND Supabase configured.
//      (Pending Task #17 — falls through for now.)
//   3. In-memory + seed     — USE_SEED=true (dev default). Demo data.
//   4. In-memory + EMPTY    — USE_SEED=false without Supabase. Real empty state.
//
// Setting USE_SEED=false is the "wipe the fake data" lever: every list, KPI
// and dashboard renders its true empty state. Combined with Supabase
// credentials, the app starts pulling real data from the DB.

import type { DataSource } from "./repository";
import { createInMemoryDataSource } from "./in-memory";
import { buildEmptySeed } from "./in-memory/seed";
import { appConfig } from "@/lib/integrations/config";
import { isSupabaseConfigured } from "@/lib/integrations/supabase";
import { createSupabaseDataSource } from "./supabase";

let override: DataSource | null = null;

/**
 * Resolve the DataSource for the current request. Async because the Supabase
 * adapter is request-scoped (it binds to the request's cookies).
 *
 * Selection order:
 *   1. setDataSource()           — explicit override (tests).
 *   2. Supabase                  — USE_SEED=false AND Supabase configured.
 *      Each call returns a fresh instance bound to the request session.
 *   3. In-memory + demo seed     — USE_SEED=true (dev default).
 *   4. In-memory + EMPTY seed    — USE_SEED=false without Supabase.
 *      Real empty state, useful while you're setting up the backend.
 */
export async function getDataSource(): Promise<DataSource> {
  if (override) return override;
  if (!appConfig.useSeed && isSupabaseConfigured()) {
    return createSupabaseDataSource();
  }
  return appConfig.useSeed
    ? createInMemoryDataSource()
    : createInMemoryDataSource(buildEmptySeed());
}

/** Override the active DataSource (tests). */
export function setDataSource(ds: DataSource | null): void {
  override = ds;
}
