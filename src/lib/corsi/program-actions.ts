"use server";

// Persist the per-course Programma & Economia overlay. Admin/manager only
// (editing a course program is a course-management action).

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvReadVersioned, kvCasSave, CONFLICT_MSG } from "@/lib/data/kv-cas";
import { hasRole } from "@/lib/auth/guard";
import { PROGRAM_KEY } from "./program-load";
import type { CourseProgramOverlay } from "./program-overlay";

export interface ProgramActionResult {
  ok: boolean;
  error?: string;
  /** Another user edited THIS course's program — reload before saving again. */
  conflict?: boolean;
  /** New per-course version after a successful save. */
  newVersion?: number;
}

/** Save one course's Programma & Economia overlay. ONE settings_kv row holds
 *  every course's overlay, so concurrency has two layers (Bug 4):
 *  - row-level CAS (value.__v): two people saving DIFFERENT courses no longer
 *    wipe each other — the loser auto-retries on the fresh row (invisible);
 *  - per-course version (items[courseId].__pv): a stale editor of the SAME
 *    course gets an explicit conflict instead of clobbering the other's edits.
 *  `expectedItemVersion` comes from the loaded overlay's __pv (0 when absent). */
export async function saveCourseProgramAction(
  courseId: string,
  overlay: CourseProgramOverlay,
  expectedItemVersion?: number,
): Promise<ProgramActionResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { value, version } = await kvReadVersioned<{
        items?: Record<string, CourseProgramOverlay>;
      }>(svc, PROGRAM_KEY);
      const items = value?.items ?? {};
      const currentItemV = items[courseId]?.__pv ?? 0;
      if (expectedItemVersion != null && expectedItemVersion !== currentItemV) {
        return { ok: false, error: CONFLICT_MSG, conflict: true };
      }
      const nextItemV = currentItemV + 1;
      const next = { items: { ...items, [courseId]: { ...overlay, __pv: nextItemV } } };
      const res = await kvCasSave(svc, PROGRAM_KEY, next, version);
      if (res === "ok") {
        revalidatePath(`/corsi/${courseId}`);
        return { ok: true, newVersion: nextItemV };
      }
      // Row-level conflict: someone saved ANOTHER course meanwhile — re-read
      // the fresh row and retry (their edits are preserved, ours re-applied).
    }
    return { ok: false, error: CONFLICT_MSG, conflict: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
