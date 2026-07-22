import "server-only";

// Live count of handed-in FINAL exams for a course — the "Esiti" tab badge. It
// grows as students submit (before staff correct them). `mode="exam"` excludes
// previews; `test_key="final"` is the graded exam (day tests are formative, not
// esiti). Best-effort: a query error yields 0 (this is a badge, never a gate).
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

export async function countFinalSubmissions(courseId: number | string): Promise<number> {
  const id = typeof courseId === "string" ? Number(courseId) : courseId;
  if (!Number.isFinite(id)) return 0;
  try {
    const svc = getSupabaseServiceClient();
    const { count, error } = await svc
      .from("exam_submissions")
      .select("id", { count: "exact", head: true })
      .eq("corso_id", id)
      .eq("test_key", "final")
      .eq("mode", "exam");
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}
