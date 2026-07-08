"use server";

// Persist the shared Pianificatore state. Admin/manager only (planning tool).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvCasPatch, CONFLICT_MSG } from "@/lib/data/kv-cas";
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
    // CAS write (auto-retry): keeps the row's version monotonic so autosaves
    // can never interleave a torn state. (Bug 4 residual: two admins with the
    // planner open at the same instant still last-write-wins — rare.)
    const res = await kvCasPatch(svc, PLANNER_KEY, () => state as unknown as Record<string, unknown>);
    if (res === "conflict") return { ok: false, error: CONFLICT_MSG };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
