import "server-only";

// In-app replacement for the never-configured external cron: the platform
// runs on a long-lived Node server (Render web service), so a plain interval
// gives the same continuity with zero external moving parts. Every tick runs
// the Shopify sync — with the daily alert emails riding along, exactly like
// the cron endpoint — but only when the watermark is older than the interval,
// so a manual "Aggiorna" click quiets the next tick instead of doubling it.
//
// Env knobs (all optional): SYNC_CRON_DISABLED=1 turns it off;
// SYNC_CRON_MINUTES overrides the cadence (default 15, clamped 5–720).

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { executeSyncRun } from "./run-job";
import { isRunInFlight, markSyncStarted, readSyncRunStatus } from "./run-status";
import { runAlertChecks } from "@/lib/alerts/checks";

const DEFAULT_MINUTES = 15;
const FIRST_TICK_DELAY_MS = 90_000; // let the fresh deploy warm up first

let installed = false;

function intervalMinutes(): number {
  const n = Number(process.env.SYNC_CRON_MINUTES);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MINUTES;
  return Math.min(Math.max(Math.round(n), 5), 720);
}

async function watermarkAgeMs(svc: ReturnType<typeof getSupabaseServiceClient>): Promise<number> {
  try {
    const { data } = await svc
      .from("sync_state")
      .select("last_synced_at")
      .eq("source", "shopify")
      .maybeSingle();
    const t = data?.last_synced_at ? Date.parse(data.last_synced_at) : NaN;
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : Date.now() - t;
  } catch {
    // Unknown watermark: err on the side of syncing.
    return Number.POSITIVE_INFINITY;
  }
}

async function tick(minutes: number): Promise<void> {
  try {
    const svc = getSupabaseServiceClient();
    if (isRunInFlight(await readSyncRunStatus(svc), Date.now())) return;
    // Fresh enough (e.g. someone just clicked Aggiorna)? Skip this tick.
    if ((await watermarkAgeMs(svc)) < (minutes - 1) * 60_000) return;

    const startedAt = new Date().toISOString();
    await markSyncStarted(svc, startedAt);
    console.log(`[sync-cron] run started at ${startedAt}`);
    await executeSyncRun(svc, startedAt, {
      afterSync: async () => {
        await runAlertChecks(Date.now());
      },
    });
    console.log(`[sync-cron] run finished (started ${startedAt})`);
  } catch (e) {
    console.error("[sync-cron] tick failed:", e instanceof Error ? e.message : e);
  }
}

/** Idempotent: called once per server instance from instrumentation.ts. */
export function startSyncScheduler(): void {
  if (installed) return;
  installed = true;

  const disabledFlag = (process.env.SYNC_CRON_DISABLED ?? "").toLowerCase();
  if (disabledFlag === "1" || disabledFlag === "true") {
    console.log("[sync-cron] disabled via SYNC_CRON_DISABLED");
    return;
  }

  const minutes = intervalMinutes();
  console.log(`[sync-cron] active — checking every ${minutes} min`);
  const run = () => void tick(minutes);
  // unref(): the scheduler must never keep a stopping process alive.
  setTimeout(run, FIRST_TICK_DELAY_MS).unref();
  setInterval(run, minutes * 60_000).unref();
}
