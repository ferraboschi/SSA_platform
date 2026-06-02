"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

/** Mark an anomaly as reviewed/OK by clearing the corsista's review_note. */
export async function resolveAnomalyAction(corsistaId: number): Promise<void> {
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

/** Names of email-clusters the operator already reviewed (settings_kv). */
export async function getReviewedEmailClusters(): Promise<string[]> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", EMAIL_CLUSTER_KEY)
    .maybeSingle();
  return ((data?.value as { names?: string[] })?.names) ?? [];
}
