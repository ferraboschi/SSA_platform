import "server-only";

// settings_kv-backed store for the 3 exam-result email templates. Plain async
// helpers (not server actions) so the send path can import them directly.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvCasPatch, CONFLICT_MSG } from "@/lib/data/kv-cas";
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
  // CAS write (auto-retry): keeps the row's version monotonic so no writer can
  // interleave a torn state. (Bug 4 residual: two humans editing the email
  // templates at the same instant still last-write-wins — single-admin tool.)
  const res = await kvCasPatch(svc, KEY, () => t as unknown as Record<string, unknown>);
  if (res === "conflict") throw new Error(CONFLICT_MSG);
}
