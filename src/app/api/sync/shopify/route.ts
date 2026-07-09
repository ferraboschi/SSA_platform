// Cron / webhook entry point for the Shopify → Supabase sync.
//
// Protected by a shared secret (SYNC_SECRET): pass it as `?token=…` or an
// `x-sync-token` header. A scheduled job hits this periodically; the same
// endpoint also backs manual/automation triggers. `?full=1` forces a full
// backfill instead of the incremental window.
//
// The sync takes minutes — past Render's ~100s HTTP timeout — so by default
// the endpoint responds 202 immediately and the run completes in background
// (outcome in settings_kv "sync_run_status"). Pass `?wait=1` to block until
// the run finishes and get the full summary back (local testing only).
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { runShopifySync } from "@/lib/sync/shopify-sync";
import { startShopifySyncJob } from "@/lib/sync/run-job";
import { runAlertChecks } from "@/lib/alerts/checks";
import { SHELL_DATA_TAG } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.SYNC_SECRET;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-sync-token") ?? url.searchParams.get("token");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const fullBackfill = url.searchParams.get("full") === "1";

  if (url.searchParams.get("wait") === "1") {
    // Synchronous mode: only usable where no proxy timeout applies.
    try {
      const summary = await runShopifySync({ fullBackfill });
      let alerts;
      try {
        alerts = await runAlertChecks(Date.now());
      } catch {
        /* alert checks must never fail the sync */
      }
      revalidateTag(SHELL_DATA_TAG, "max");
      revalidatePath("/", "layout");
      return NextResponse.json({ ok: true, summary, alerts });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: (e as Error).message },
        { status: 500 },
      );
    }
  }

  try {
    const res = await startShopifySyncJob({
      fullBackfill,
      // Operational alert emails (invoice→Luigi, low-stock→Camilla) ride on
      // the scheduled sync, as they always did on this endpoint. Non-fatal.
      afterSync: async () => {
        await runAlertChecks(Date.now());
      },
    });
    return NextResponse.json(
      { ok: true, started: res.started, alreadyRunning: res.alreadyRunning, startedAt: res.startedAt },
      { status: res.started ? 202 : 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
