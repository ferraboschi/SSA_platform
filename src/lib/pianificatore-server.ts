import "server-only";

// Server-only loader for the shared Pianificatore state (settings_kv).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { PlannerSaved } from "./pianificatore";

export const PLANNER_KEY = "planner_state";

/** Load the shared planner state (targets, planned courses, thresholds). */
export async function loadPlannerState(): Promise<PlannerSaved | null> {
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", PLANNER_KEY)
      .maybeSingle();
    return (data?.value as PlannerSaved | null) ?? null;
  } catch {
    return null;
  }
}
