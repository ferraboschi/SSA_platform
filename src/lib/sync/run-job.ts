import "server-only";

// Background launcher for the Shopify sync, shared by the top-bar button
// (server action) and the cron endpoint. The full sync takes minutes — past
// Render's ~100s HTTP timeout — so callers respond immediately and the work
// completes via next/server `after()`, with the outcome recorded in
// sync_run_status for the pollers.
//
// NOT a server action on purpose: it performs no auth. Callers gate access
// (role check in the action, shared secret in the route).

import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { runShopifySync, type SyncSummary } from "./shopify-sync";
import {
  isRunInFlight,
  markSyncFinished,
  markSyncStarted,
  readSyncRunStatus,
} from "./run-status";
import { SHELL_DATA_TAG } from "@/lib/shell-data";

export interface StartSyncResult {
  started: boolean;
  alreadyRunning: boolean;
  startedAt: string;
}

export interface SyncJobOptions {
  fullBackfill?: boolean;
  /** Extra work to run after a successful sync (e.g. cron alert checks). */
  afterSync?: (summary: SyncSummary) => Promise<void>;
}

type Svc = ReturnType<typeof getSupabaseServiceClient>;

// Hard cap on a single run — kept BELOW SYNC_RUN_STALE_MS (10') so the "running"
// marker is always finished before it's judged stale, and two runs never overlap.
// The per-request timeout already bounds any single hung call; this is the final
// backstop so the sync can NEVER stay "running" forever (data stuck on old data).
const RUN_TIMEOUT_MS = 9 * 60_000;

/** Reject after `ms` if `p` hasn't settled. The orphaned work keeps running but
 *  the run is recorded as finished (error) so the "running" marker clears. */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * The run itself: sync + bookkeeping + side jobs. Never throws — every
 * outcome lands in sync_run_status. Shared by the request-triggered path
 * (via after()) and the in-app scheduler (which has no request scope).
 */
export async function executeSyncRun(
  svc: Svc,
  startedAt: string,
  opts?: SyncJobOptions,
): Promise<void> {
  try {
    const summary = await withTimeout(
      runShopifySync({ fullBackfill: opts?.fullBackfill }),
      RUN_TIMEOUT_MS,
      "Sincronizzazione oltre il tempo massimo — interrotta per non restare bloccata.",
    );
    await markSyncFinished(svc, startedAt, { ok: true, summary });
    if (opts?.afterSync) {
      try {
        await opts.afterSync(summary);
      } catch {
        /* side jobs must never mark the sync itself as failed */
      }
    }
    try {
      revalidateTag(SHELL_DATA_TAG, "max");
      revalidatePath("/", "layout");
    } catch {
      // Throws outside a request scope (scheduler ticks): cached shell data
      // then refreshes on its own TTL; the data tables are updated regardless.
    }
  } catch (e) {
    await markSyncFinished(svc, startedAt, {
      ok: false,
      error: e instanceof Error ? e.message : "Sincronizzazione non riuscita.",
    });
  }
}

export async function startShopifySyncJob(opts?: SyncJobOptions): Promise<StartSyncResult> {
  const svc = getSupabaseServiceClient();
  const status = await readSyncRunStatus(svc);
  if (isRunInFlight(status, Date.now())) {
    return { started: false, alreadyRunning: true, startedAt: status!.startedAt! };
  }

  const startedAt = new Date().toISOString();
  await markSyncStarted(svc, startedAt);
  after(() => executeSyncRun(svc, startedAt, opts));
  return { started: true, alreadyRunning: false, startedAt };
}
