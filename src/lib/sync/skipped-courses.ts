import "server-only";

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

export interface SkippedCourse {
  productId: string;
  title: string;
  reason: string;
}

/**
 * Shopify ticket products the last sync could NOT turn into a platform course AND
 * that are not already in the platform (external_id absent). This is the
 * genuinely "published on Shopify but not integrated" set — surfaced so a course
 * can never stay silently invisible (the platform's worst failure mode).
 *
 * The reason comes from the sync itself (unparseable title/metafields, or an
 * operator-ignored bundle). Best-effort: any read failure yields an empty list.
 */
export async function loadSkippedCourses(): Promise<SkippedCourse[]> {
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc
      .from("sync_state")
      .select("last_summary")
      .eq("source", "shopify")
      .maybeSingle();
    const skipped =
      ((data?.last_summary as { skippedProducts?: SkippedCourse[] } | null)?.skippedProducts) ?? [];
    if (skipped.length === 0) return [];

    const { data: corsi } = await svc.from("corsi").select("external_id").not("external_id", "is", null);
    const have = new Set(
      ((corsi ?? []) as { external_id: string | number }[]).map((c) => String(c.external_id)),
    );
    return skipped.filter((p) => p.productId && !have.has(String(p.productId)));
  } catch {
    return [];
  }
}
