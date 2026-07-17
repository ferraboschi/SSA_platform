"use server";

// The end-of-course FEEDBACK questionnaires. The owner wants TWO, by course
// length (not by exam family): "short" (One Day, Masterclass, quick courses) and
// "long" (Certificato, Shochu). They live in one settings_kv row, independent of
// the per-family exam templates, so every course type can have feedback (always
// optional to fill). `feedbackVariant(type)` (COURSE_PROFILE) picks which set a
// course uses. Admin/manager only — same posture as the exam library editor.
//
// Saves are optimistic-concurrency protected (kv-cas): a stale editor gets a
// conflict instead of clobbering a parallel edit (Bug 4).

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvReadVersioned, kvCasSave, CONFLICT_MSG } from "@/lib/data/kv-cas";
import { assertRole, hasRole } from "@/lib/auth/guard";
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

/** Both feedback questionnaires + the concurrency version the editor must send
 *  back on save. `long` falls back to the certificato template's feedback until
 *  it's saved standalone at least once. */
export async function loadFeedbackSetsAction(): Promise<FeedbackSets & { version: number }> {
  await assertRole(["admin", "manager"]);
  const svc = getSupabaseServiceClient();
  const { store, version } = await readStore(svc);
  const long = store.long ?? (await deriveLongFromTemplate(svc));
  return { short: store.short ?? [], long, version };
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

export interface SaveFeedbackResult {
  ok: boolean;
  error?: string;
  /** Another editor saved in the meantime — reload before saving again. */
  conflict?: boolean;
  /** New concurrency version after a successful save. */
  newVersion?: number;
}

export async function saveFeedbackSetAction(
  variant: FeedbackVariant,
  questions: ExamQuestion[],
  expectedVersion: number,
): Promise<SaveFeedbackResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  try {
    const svc = getSupabaseServiceClient();
    const { store, version } = await readStore(svc);
    // A stale editor must not clobber the other variant either — refuse early
    // if the row moved since this editor loaded.
    if (version !== expectedVersion) return { ok: false, error: CONFLICT_MSG, conflict: true };
    // Ensure the other variant AND the stored translations are preserved
    // (and 'long' materialised on first save).
    const base: FeedbackSets = {
      short: store.short ?? [],
      long: store.long ?? (await deriveLongFromTemplate(svc)),
      ...(store.translations ? { translations: store.translations } : {}),
    };
    const next: FeedbackSets = { ...base, [variant]: questions };
    const res = await kvCasSave(svc, KEY, next as unknown as Record<string, unknown>, expectedVersion);
    if (res === "conflict") return { ok: false, error: CONFLICT_MSG, conflict: true };
    return { ok: true, newVersion: expectedVersion + 1 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Salvataggio non riuscito." };
  }
}
