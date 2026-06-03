import "server-only";

// Server-only loader for the per-course Programma & Economia overlay.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { CourseProgramOverlay } from "./program-overlay";

export const PROGRAM_KEY = "course_program";

interface StoredProgram {
  items?: Record<string, CourseProgramOverlay>;
}

/** Load every course's program overlay, keyed by domain course id. */
export async function loadCourseProgram(): Promise<Map<string, CourseProgramOverlay>> {
  const map = new Map<string, CourseProgramOverlay>();
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", PROGRAM_KEY)
      .maybeSingle();
    const items = (data?.value as StoredProgram | null)?.items ?? {};
    for (const [id, rec] of Object.entries(items)) map.set(id, rec);
  } catch {
    /* settings_kv unavailable → empty overlay */
  }
  return map;
}
