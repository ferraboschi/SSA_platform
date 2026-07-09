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

export async function startShopifySyncJob(opts?: {
  fullBackfill?: boolean;
  /** Extra work to run after a successful sync (e.g. cron alert checks). */
  afterSync?: (summary: SyncSummary) => Promise<void>;
}): Promise<StartSyncResult> {
  const svc = getSupabaseServiceClient();
  const status = await readSyncRunStatus(svc);
  if (isRunInFlight(status, Date.now())) {
    return { started: false, alreadyRunning: true, startedAt: status!.startedAt! };
  }

  const startedAt = new Date().toISOString();
  await markSyncStarted(svc, startedAt);
  after(async () => {
    try {
      const summary = await runShopifySync({ fullBackfill: opts?.fullBackfill });
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
        /* fresh data still reaches clients on their next router refresh */
      }
    } catch (e) {
      await markSyncFinished(svc, startedAt, {
        ok: false,
        error: e instanceof Error ? e.message : "Sincronizzazione non riuscita.",
      });
    }
  });
  return { started: true, alreadyRunning: false, startedAt };
}
