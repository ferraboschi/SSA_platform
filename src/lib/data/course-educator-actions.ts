"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

/**
 * Assign (or clear) the educator of a course. Staff-only. `educatorId` is the
 * domain Educator id (external_id slug, or "db-<n>"); null clears it. This is
 * how the team backfills the historical course↔educator links that aren't in
 * any imported source.
 */
export async function assignEducatorAction(
  courseId: string,
  educatorId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  const role = session?.user?.roleKey;
  if (role !== "admin" && role !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  const svc = getSupabaseServiceClient();

  let educatorNumericId: number | null = null;
  if (educatorId) {
    if (educatorId.startsWith("db-")) {
      educatorNumericId = Number(educatorId.slice(3)) || null;
    } else {
      const { data } = await svc
        .from("educators")
        .select("id")
        .eq("external_id", educatorId)
        .maybeSingle();
      educatorNumericId = (data?.id as number | undefined) ?? null;
    }
    if (educatorNumericId == null) return { ok: false, error: "Educator non trovato." };
  }

  const { error } = await svc
    .from("corsi")
    .update({ educator_id: educatorNumericId })
    .eq("id", Number(courseId));
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/corsi/${courseId}`);
  revalidatePath("/educator", "layout");
  return { ok: true };
}
