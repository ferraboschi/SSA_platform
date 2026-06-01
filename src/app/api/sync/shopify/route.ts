// Cron / webhook entry point for the Shopify → Supabase sync.
//
// Protected by a shared secret (SYNC_SECRET): pass it as `?token=…` or an
// `x-sync-token` header. A Render Cron Job hits this on a schedule; the same
// endpoint also backs manual/automation triggers. `?full=1` forces a full
// backfill instead of the incremental window.
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { runShopifySync } from "@/lib/sync/shopify-sync";
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
  try {
    const summary = await runShopifySync({ fullBackfill });
    revalidateTag(SHELL_DATA_TAG, "max");
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
