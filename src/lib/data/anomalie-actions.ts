"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { assertRole } from "@/lib/auth/guard";

/** Mark an anomaly as reviewed/OK by clearing the corsista's review_note. */
export async function resolveAnomalyAction(corsistaId: number): Promise<void> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { error } = await svc
    .from("corsisti")
    .update({ review_note: null })
    .eq("id", corsistaId);
  if (error) throw error;
  revalidatePath("/anomalie");
}

const EMAIL_CLUSTER_KEY = "reviewed_email_clusters";

/** Dismiss a multi-email cluster (computed live) so it no longer shows. */
export async function dismissEmailClusterAction(nameKey: string): Promise<void> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", EMAIL_CLUSTER_KEY)
    .maybeSingle();
  const names = new Set(((data?.value as { names?: string[] })?.names) ?? []);
  names.add(nameKey);
  const { error } = await svc
    .from("settings_kv")
    .upsert({ key: EMAIL_CLUSTER_KEY, value: { names: [...names] } }, { onConflict: "key" });
  if (error) throw error;
  revalidatePath("/anomalie");
}

/**
 * Merge duplicate corsisti into one primary record. Non-destructive (mai buttare
 * dati): the duplicates KEEP their rows (with their email/phone preserved) but
 * get `merged_into` set so they're hidden from lists; their enrollments are moved
 * to the survivor (conflicts — same course already on the survivor — are left in
 * place), and diploma numbers are unioned onto the survivor.
 */
export async function mergeCorsistiAction(
  survivorId: number,
  duplicateIds: number[],
): Promise<void> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const dups = duplicateIds.filter((d) => d !== survivorId);
  if (dups.length === 0) return;

  // Reassign enrollments to the survivor, skipping courses it's already in.
  const { data: survEnr } = await svc
    .from("corsi_iscrizioni")
    .select("corso_id")
    .eq("corsista_id", survivorId);
  const survCourses = new Set(((survEnr ?? []) as { corso_id: number }[]).map((r) => r.corso_id));
  for (const dupId of dups) {
    const { data: dupEnr } = await svc
      .from("corsi_iscrizioni")
      .select("id,corso_id")
      .eq("corsista_id", dupId);
    for (const e of (dupEnr ?? []) as { id: number; corso_id: number }[]) {
      if (survCourses.has(e.corso_id)) continue; // duplicate enrollment → leave on the merged row
      const { error } = await svc
        .from("corsi_iscrizioni")
        .update({ corsista_id: survivorId })
        .eq("id", e.id);
      if (!error) survCourses.add(e.corso_id);
    }
  }

  // Union diploma numbers onto the survivor.
  const { data: dipRows } = await svc
    .from("corsisti")
    .select("id,diploma_numbers")
    .in("id", [survivorId, ...dups]);
  const allDip = new Set<string>();
  for (const r of (dipRows ?? []) as { diploma_numbers: string[] | null }[]) {
    for (const d of r.diploma_numbers ?? []) if (d) allDip.add(d);
  }
  await svc.from("corsisti").update({ diploma_numbers: [...allDip] }).eq("id", survivorId);

  // Fold the duplicates into the survivor (kept, hidden).
  const { error } = await svc
    .from("corsisti")
    .update({ merged_into: survivorId })
    .in("id", dups);
  if (error) throw error;

  revalidatePath("/anomalie");
  revalidatePath("/corsisti", "layout");
}

/** Names of email-clusters the operator already reviewed (settings_kv). */
export async function getReviewedEmailClusters(): Promise<string[]> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", EMAIL_CLUSTER_KEY)
    .maybeSingle();
  return ((data?.value as { names?: string[] })?.names) ?? [];
}
