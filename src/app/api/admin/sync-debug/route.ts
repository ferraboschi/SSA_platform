import { NextResponse } from "next/server";
import { runShopifySync } from "@/lib/sync/shopify-sync";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";

// Gated diagnostic: runs the Shopify → Supabase sync and reports what landed for
// masterclasses specifically, so we can tell whether the issue is sync (not
// inserted) or display (inserted but hidden). Admin-session OR SYNC_SECRET.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  const bySecret = Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
  const byAdmin = await hasRole(["admin"]).catch(() => false);
  if (!bySecret && !byAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let summary: unknown = null;
  let syncError: string | null = null;
  try {
    summary = await runShopifySync();
  } catch (e) {
    syncError = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  }

  const sb = getSupabaseServiceClient();
  const { data, error } = await sb
    .from("corsi")
    .select("id, external_id, full_title, type, lifecycle, delivery_mode, city, month, year, start_date")
    .eq("type", "masterclass")
    .order("start_date", { ascending: true });

  return NextResponse.json({
    ok: !syncError,
    syncError,
    summary,
    masterclassCount: data?.length ?? 0,
    masterclasses: data ?? [],
    dbError: error?.message ?? null,
  });
}
