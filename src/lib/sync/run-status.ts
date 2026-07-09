import "server-only";

// Bookkeeping for the async Shopify sync (settings_kv "sync_run_status").
//
// The sync takes minutes — longer than Render's ~100s HTTP timeout — so the
// trigger (button / cron endpoint) responds immediately and the work continues
// via next/server `after()`. This marker is how the UI and the endpoint know
// whether a run is in flight and how the last one ended.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { SyncSummary } from "./shopify-sync";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

const KEY = "sync_run_status";

// A "running" marker older than this is a dead run (process restarted or
// crashed mid-sync): ignore it so the next trigger isn't blocked forever.
export const SYNC_RUN_STALE_MS = 10 * 60_000;

export interface SyncRunStatus {
  running?: boolean;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  error?: string;
  summary?: SyncSummary;
}

/** True if `status` is a live in-flight run (started recently, not finished). */
export function isRunInFlight(status: SyncRunStatus | null, nowMs: number): boolean {
  if (!status?.running || !status.startedAt) return false;
  const started = Date.parse(status.startedAt);
  if (Number.isNaN(started)) return false;
  return nowMs - started < SYNC_RUN_STALE_MS;
}

export async function readSyncRunStatus(svc: Svc): Promise<SyncRunStatus | null> {
  try {
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    return (data?.value as SyncRunStatus) ?? null;
  } catch {
    return null;
  }
}

async function write(svc: Svc, value: SyncRunStatus): Promise<void> {
  await svc
    .from("settings_kv")
    .upsert({ key: KEY, value: value as unknown as Record<string, unknown> }, { onConflict: "key" });
}

/** Best-effort: bookkeeping must never break the sync itself. */
export async function markSyncStarted(svc: Svc, startedAt: string): Promise<void> {
  try {
    await write(svc, { running: true, startedAt });
  } catch {
    /* non-fatal */
  }
}

export async function markSyncFinished(
  svc: Svc,
  startedAt: string,
  result: { ok: true; summary: SyncSummary } | { ok: false; error: string },
): Promise<void> {
  try {
    await write(svc, {
      running: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      summary: result.ok ? result.summary : undefined,
    });
  } catch {
    /* non-fatal */
  }
}
