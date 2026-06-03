"use server";

// Persist the shared Pianificatore state. Admin/manager only (planning tool).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import { PLANNER_KEY } from "./pianificatore-server";
import type { PlannerSaved } from "./pianificatore";

export interface PlannerActionResult {
  ok: boolean;
  error?: string;
}

export async function savePlannerStateAction(
  state: PlannerSaved,
): Promise<PlannerActionResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
    await svc
      .from("settings_kv")
      .upsert({ key: PLANNER_KEY, value: state }, { onConflict: "key" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
