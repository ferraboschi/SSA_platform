import "server-only";

// settings_kv-backed store for the 3 exam-result email templates. Plain async
// helpers (not server actions) so the send path can import them directly.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import {
  mergeExamEmailTemplates,
  type ExamEmailTemplates,
} from "./exam-email";

const KEY = "exam-email-templates";

export async function loadExamEmailTemplates(): Promise<ExamEmailTemplates> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  return mergeExamEmailTemplates(
    (data?.value ?? null) as Parameters<typeof mergeExamEmailTemplates>[0],
  );
}

export async function writeExamEmailTemplates(t: ExamEmailTemplates): Promise<void> {
  const svc = getSupabaseServiceClient();
  await svc.from("settings_kv").upsert({ key: KEY, value: t }, { onConflict: "key" });
}
