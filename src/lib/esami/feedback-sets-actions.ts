"use server";

// The end-of-course FEEDBACK questionnaires. The owner wants TWO, by course
// length (not by exam family): "short" (One Day, Masterclass, quick courses) and
// "long" (Certificato, Shochu). They live in one settings_kv row, independent of
// the per-family exam templates, so every course type can have feedback (always
// optional to fill). `feedbackVariant(type)` (COURSE_PROFILE) picks which set a
// course uses. Admin/manager only — same posture as the exam library editor.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { assertRole, hasRole } from "@/lib/auth/guard";
import type { ExamQuestion, FeedbackVariant } from "@/lib/domain";

const KEY = "feedback-sets";

export interface FeedbackSets {
  short: ExamQuestion[];
  long: ExamQuestion[];
}

type Svc = ReturnType<typeof getSupabaseServiceClient>;

async function readStore(svc: Svc): Promise<Partial<FeedbackSets>> {
  const { data } = await svc.from("settings_kv").select("value").eq("key", KEY).maybeSingle();
  return ((data as { value?: Partial<FeedbackSets> } | null)?.value ?? {}) as Partial<FeedbackSets>;
}

/** Seed the "long" set from the certificato template's existing feedback the
 *  first time (so already-authored feedback questions aren't lost / re-typed). */
async function deriveLongFromTemplate(svc: Svc): Promise<ExamQuestion[]> {
  const { data: tpl } = await svc
    .from("exam_templates")
    .select("data")
    .eq("family", "certificato")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const qs = ((tpl as { data?: { feedback?: { questions?: ExamQuestion[] } } } | null)?.data?.feedback
    ?.questions ?? []) as ExamQuestion[];
  return qs;
}

/** Both feedback questionnaires. `long` falls back to the certificato template's
 *  feedback until it's saved standalone at least once. */
export async function loadFeedbackSetsAction(): Promise<FeedbackSets> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const store = await readStore(svc);
  const long = store.long ?? (await deriveLongFromTemplate(svc));
  return { short: store.short ?? [], long };
}

/** The questions for ONE variant (used by the public feedback runner). Returns
 *  [] when unset — no role gate: the runner is a public tokenized surface. */
export async function loadFeedbackSet(variant: FeedbackVariant): Promise<ExamQuestion[]> {
  const svc = getSupabaseServiceClient();
  const store = await readStore(svc);
  if (variant === "long") return store.long ?? (await deriveLongFromTemplate(svc));
  return store.short ?? [];
}

export interface SaveFeedbackResult {
  ok: boolean;
  error?: string;
}

export async function saveFeedbackSetAction(
  variant: FeedbackVariant,
  questions: ExamQuestion[],
): Promise<SaveFeedbackResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  try {
    const svc = getSupabaseServiceClient();
    const store = await readStore(svc);
    // Ensure the other variant is preserved (and 'long' materialised on first save).
    const base: FeedbackSets = {
      short: store.short ?? [],
      long: store.long ?? (await deriveLongFromTemplate(svc)),
    };
    const next: FeedbackSets = { ...base, [variant]: questions };
    const { error } = await svc.from("settings_kv").upsert({ key: KEY, value: next }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
