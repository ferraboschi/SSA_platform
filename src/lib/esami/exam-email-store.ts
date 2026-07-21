import "server-only";

// settings_kv-backed store for the exam-result email templates, per language
// (it / en / ja). Plain async helpers (not server actions) so the send path can
// import them directly. Back-compat: an old FLAT value (Italian only) is read as
// the Italian slice by coerceSavedEmailTemplates — no staff edit is lost.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { kvCasPatch, CONFLICT_MSG } from "@/lib/data/kv-cas";
import {
  mergeExamEmailTemplates,
  coerceSavedEmailTemplates,
  EXAM_EMAIL_LANGS,
  type ExamEmailLang,
  type ExamEmailTemplates,
  type ExamEmailTemplatesByLang,
} from "./exam-email";

const KEY = "exam-email-templates";

async function readSaved(): Promise<ExamEmailTemplatesByLang> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  return coerceSavedEmailTemplates(data?.value ?? null);
}

/** Merged templates for ONE language — the send path (alerts/emails.ts). Unedited
 *  languages fall back to their built-in defaults. */
export async function loadExamEmailTemplatesForLang(
  lang: ExamEmailLang,
): Promise<ExamEmailTemplates> {
  const saved = await readSaved();
  return mergeExamEmailTemplates(saved[lang] ?? null, lang);
}

/** Merged templates for ALL languages — the editor (one tab per language). */
export async function loadAllExamEmailTemplates(): Promise<
  Record<ExamEmailLang, ExamEmailTemplates>
> {
  const saved = await readSaved();
  const out = {} as Record<ExamEmailLang, ExamEmailTemplates>;
  for (const l of EXAM_EMAIL_LANGS) {
    out[l] = mergeExamEmailTemplates(saved[l] ?? null, l);
  }
  return out;
}

/** Persist all three languages (nested shape). CAS write (auto-retry) keeps the
 *  row version monotonic so no writer interleaves a torn state. (Single-admin
 *  tool: two humans editing at the same instant still last-write-wins.) */
export async function writeAllExamEmailTemplates(
  byLang: Record<ExamEmailLang, ExamEmailTemplates>,
): Promise<void> {
  const svc = getSupabaseServiceClient();
  const res = await kvCasPatch(svc, KEY, () => byLang as unknown as Record<string, unknown>);
  if (res === "conflict") throw new Error(CONFLICT_MSG);
}
