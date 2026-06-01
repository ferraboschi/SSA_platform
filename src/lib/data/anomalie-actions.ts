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
