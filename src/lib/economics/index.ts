import "server-only";

// Server-only loader for the per-course economics overlay (settings_kv).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { EMPTY_ECON, type CourseEconomics } from "./types";

export const ECON_KEY = "course_economics";

interface StoredEcon {
  items?: Record<string, Partial<CourseEconomics>>;
}

/** Load every course's economics overlay, keyed by domain course id. */
export async function loadCourseEconomics(): Promise<Map<string, CourseEconomics>> {
  const map = new Map<string, CourseEconomics>();
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", ECON_KEY)
      .maybeSingle();
    const items = (data?.value as StoredEcon | null)?.items ?? {};
    for (const [id, rec] of Object.entries(items)) {
      map.set(id, { ...EMPTY_ECON, ...rec });
    }
  } catch {
    /* settings_kv unavailable → empty overlay */
  }
  return map;
}

export type { CourseEconomics };
