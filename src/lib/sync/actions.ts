"use server";

import { getSession } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { SyncSummary } from "./shopify-sync";
import { startShopifySyncJob } from "./run-job";
import { readSyncRunStatus, type SyncRunStatus } from "./run-status";

export interface SyncActionResult {
  ok: boolean;
  /** A new run was started (completes in background — poll for the outcome). */
  started?: boolean;
  /** Someone else's run is already in flight — poll for that one instead. */
  alreadyRunning?: boolean;
  startedAt?: string;
  error?: string;
}

export interface SyncStatusResult {
  ok: boolean;
  running?: boolean;
  startedAt?: string;
  finishedAt?: string;
  succeeded?: boolean;
  error?: string;
  summary?: SyncSummary;
}

async function isStaff(): Promise<boolean> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  return roleKey === "admin" || roleKey === "manager";
}

/**
 * Top-bar refresh button: start the background sync and return immediately.
 * The sync takes minutes — past Render's ~100s HTTP timeout — so awaiting it
 * here would kill the request mid-flight (the "Errore di sincronizzazione"
 * the staff kept seeing). The button polls getSyncRunStatusAction for the
 * real outcome. Staff-only.
 */
export async function syncShopifyAction(): Promise<SyncActionResult> {
  if (!(await isStaff())) return { ok: false, error: "Non autorizzato." };
  try {
    const res = await startShopifySyncJob();
    return {
      ok: true,
      started: res.started,
      alreadyRunning: res.alreadyRunning,
      startedAt: res.startedAt,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Poll the outcome of the background run started via syncShopifyAction. */
export async function getSyncRunStatusAction(): Promise<SyncStatusResult> {
  if (!(await isStaff())) return { ok: false, error: "Non autorizzato." };
  try {
    const status: SyncRunStatus | null = await readSyncRunStatus(getSupabaseServiceClient());
    if (!status) return { ok: true };
    return {
      ok: true,
      running: status.running,
      startedAt: status.startedAt,
      finishedAt: status.finishedAt,
      succeeded: status.ok,
      error: status.error,
      summary: status.summary,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
