import "server-only";

// Owner's rule (batch 7, "giorni"): the platform must NEVER fabricate course
// days at display time. When staff shares the educator link for a course whose
// program has no days yet, the expected days for the type are added HERE — as
// REAL, visible, editable/deletable program entries — and the staff is told.
// From then on every surface (educator tabs, appello, exam-day number) reads
// the same real program.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvReadVersioned, kvCasSave } from "@/lib/data/kv-cas";
import { expectedDays, type CourseTypeKey } from "@/lib/domain";
import { PROGRAM_KEY } from "./program-load";
import type { CourseProgramOverlay } from "./program-overlay";

/** Seed the expected days into a course's (empty) program overlay.
 *  Returns how many days were added; 0 when the program already has days
 *  (never overwrites anything). Best-effort concurrency: same CAS layers as
 *  saveCourseProgramAction, minus the per-course conflict (a fresh seed can't
 *  clobber edits — it only runs when the course has no days at all). */
export async function seedCourseProgramDays(corsoId: number): Promise<number> {
  const svc = getSupabaseServiceClient();
  const { data: corso } = await svc
    .from("corsi")
    .select("type, delivery_mode")
    .eq("id", corsoId)
    .maybeSingle();
  if (!corso) return 0;
  const type = (corso.type ?? "introduttivo") as CourseTypeKey;
  const mode = corso.delivery_mode === "online" ? "online" : "presenza";
  const n = Math.max(1, expectedDays(type, mode));

  for (let attempt = 0; attempt < 3; attempt++) {
    const { value, version } = await kvReadVersioned<{
      items?: Record<string, CourseProgramOverlay>;
    }>(svc, PROGRAM_KEY);
    const items = value?.items ?? {};
    const current = items[String(corsoId)];
    if (current?.days?.length) return 0; // real days exist — nothing to seed

    const days = Array.from({ length: n }, (_, i) => ({
      id: `day-seed-${corsoId}-${i + 1}`,
      day: i + 1,
      name: `Giornata ${i + 1}`,
      sakes: [],
    }));
    const overlay: CourseProgramOverlay = {
      ...current,
      days,
      __pv: (current?.__pv ?? 0) + 1,
    };
    const next = { items: { ...items, [String(corsoId)]: overlay } };
    const res = await kvCasSave(svc, PROGRAM_KEY, next, version);
    if (res === "ok") return n;
    // Row-level conflict (someone saved another course) → retry on fresh row.
  }
  return 0;
}
