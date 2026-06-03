"use server";

// Persist the per-course Programma & Economia overlay. Admin/manager only
// (editing a course program is a course-management action).

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import { PROGRAM_KEY } from "./program-load";
import type { CourseProgramOverlay } from "./program-overlay";

export interface ProgramActionResult {
  ok: boolean;
  error?: string;
}

export async function saveCourseProgramAction(
  courseId: string,
  overlay: CourseProgramOverlay,
): Promise<ProgramActionResult> {
  if (!(await hasRole(["admin", "manager"]))) {
    return { ok: false, error: "Non autorizzato." };
  }
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", PROGRAM_KEY)
      .maybeSingle();
    const items =
      ((data?.value as { items?: Record<string, CourseProgramOverlay> } | null)?.items) ?? {};
    const next = { ...items, [courseId]: overlay };
    await svc
      .from("settings_kv")
      .upsert({ key: PROGRAM_KEY, value: { items: next } }, { onConflict: "key" });
    revalidatePath(`/corsi/${courseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
