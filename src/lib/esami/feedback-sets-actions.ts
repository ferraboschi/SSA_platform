"use server";

// LEGACY end-of-course feedback sets ("short"/"long" by course length).
// Superseded by the NAMED questionnaires + assignment matrix in
// feedback-templates-actions.ts (owner batch 13): this row is now read-only —
// the SEED source for the new store and the runtime FALLBACK until the seed
// lands. No editor writes here anymore.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvReadVersioned } from "@/lib/data/kv-cas";
import type { ExamQuestion, FeedbackVariant } from "@/lib/domain";

const KEY = "feedback-sets";

/** Stored EN/JA translations per question id — same shape as the exam
 *  templates' data.translations, so the public runner's language gate works
 *  identically (all-or-nothing per variant). */
export type FeedbackTransMap = Record<
  string,
  Partial<Record<"en" | "ja", { text: string; options: string[] }>>
>;

export interface FeedbackSets {
  short: ExamQuestion[];
  long: ExamQuestion[];
  translations?: FeedbackTransMap;
}

type Svc = ReturnType<typeof getSupabaseServiceClient>;

async function readStore(svc: Svc): Promise<{ store: Partial<FeedbackSets>; version: number }> {
  const { value, version } = await kvReadVersioned<Partial<FeedbackSets>>(svc, KEY);
  return { store: value ?? {}, version };
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

/** The questions for ONE variant (used by the public feedback runner). Returns
 *  [] when unset — no role gate: the runner is a public tokenized surface. */
export async function loadFeedbackSet(variant: FeedbackVariant): Promise<ExamQuestion[]> {
  const svc = getSupabaseServiceClient();
  const { store } = await readStore(svc);
  if (variant === "long") return store.long ?? (await deriveLongFromTemplate(svc));
  return store.short ?? [];
}

/** Variant questions + stored translations, for the public runner's language
 *  gate (EN/JA offered only when every question is fully translated). */
export async function loadFeedbackSetWithTranslations(
  variant: FeedbackVariant,
): Promise<{ questions: ExamQuestion[]; translations?: FeedbackTransMap }> {
  const svc = getSupabaseServiceClient();
  const { store } = await readStore(svc);
  const questions =
    variant === "long" ? (store.long ?? (await deriveLongFromTemplate(svc))) : (store.short ?? []);
  return { questions, translations: store.translations };
}
