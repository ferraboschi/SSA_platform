"use server";

// Claude-powered exam helpers. Admin/manager only.
//   • translateExamTemplateAction — one-time translation of the whole question
//     bank to EN + JA, stored in exam_templates.data.translations (keyed by the
//     same question id the public runner generates). Zero runtime cost after.
//   • gradeOpenAnswerAction — AI grading seam for open-ended answers (ready for
//     when open questions are added; not yet wired into a UI flow).

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";
import { callClaude, parseJsonFromClaude, anthropicConfig } from "@/lib/integrations/anthropic/client";
import type { ExamFamily } from "@/lib/domain";

type TLang = "en" | "ja";
const LANG_NAMES: Record<TLang, string> = { en: "English", ja: "Japanese (日本語)" };

interface QForT {
  id: string;
  text: string;
  options: string[];
}
interface RawQ {
  id?: string;
  text?: string;
  prompt?: string;
  options?: string[];
  choices?: Array<{ text: string }>;
}
interface RawData {
  questions?: RawQ[];
  miniTests?: Array<{ day: number; questions?: RawQ[] }>;
  feedback?: { questions?: RawQ[] };
  translations?: Record<string, Partial<Record<TLang, { text: string; options: string[] }>>>;
  [k: string]: unknown;
}

// Same id scheme as loadPublicExam, so stored translations match at runtime.
function extractQuestions(data: RawData, rowId: number): QForT[] {
  const out: QForT[] = [];
  const push = (q: RawQ, id: string) => {
    const text = q.text ?? q.prompt ?? "";
    const options = q.options ?? (q.choices ? q.choices.map((c) => c.text) : []);
    if (text) out.push({ id, text, options });
  };
  (data.questions ?? []).forEach((q, i) => push(q, q.id ?? `q-${rowId}-${i}`));
  (data.miniTests ?? []).forEach((m) =>
    (m.questions ?? []).forEach((q, i) => push(q, q.id ?? `q-${rowId}-d${m.day}-${i}`)),
  );
  (data.feedback?.questions ?? []).forEach((q, i) => push(q, q.id ?? `q-${rowId}-fb-${i}`));
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface TranslateResult {
  ok: boolean;
  error?: string;
  count?: number;
}

export async function translateExamTemplateAction(family: ExamFamily): Promise<TranslateResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!anthropicConfig.isConfigured) {
    return { ok: false, error: "AI non configurata (manca ANTHROPIC_API_KEY su Render)." };
  }
  const dbFamily = family === "shochu" ? "shochu" : "certificato";
  const svc = getSupabaseServiceClient();
  const { data: row } = await svc
    .from("exam_templates")
    .select("id, data")
    .eq("family", dbFamily)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "Template non trovato." };

  const data = (row.data ?? {}) as RawData;
  const qs = extractQuestions(data, row.id as number);
  if (!qs.length) return { ok: false, error: "Nessuna domanda da tradurre." };

  const translations = data.translations ?? {};
  try {
    for (const lang of ["en", "ja"] as TLang[]) {
      for (const part of chunk(qs, 25)) {
        const system = `You are a professional translator for a Sake Sommelier certification exam. Translate from Italian to ${LANG_NAMES[lang]}. Preserve the meaning precisely and keep sake/Japanese technical terms accurate. Return ONLY a JSON array of the same length and order, each item {"id": string, "text": string, "options": string[]} with the options translated in the SAME order. No commentary, no code fences.`;
        const raw = await callClaude({ system, user: JSON.stringify(part), maxTokens: 8192 });
        const out = parseJsonFromClaude<QForT[]>(raw);
        for (const item of out) {
          if (!item?.id) continue;
          translations[item.id] = {
            ...(translations[item.id] ?? {}),
            [lang]: { text: item.text, options: item.options ?? [] },
          };
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Traduzione non riuscita." };
  }

  await svc.from("exam_templates").update({ data: { ...data, translations } }).eq("id", row.id);
  revalidatePath("/esami/editor");
  return { ok: true, count: qs.length };
}

export interface GradeOpenResult {
  ok: boolean;
  score?: number;
  feedback?: string;
  error?: string;
}

/** AI grade an open-ended answer (0..maxPoints). Seam for future open questions. */
export async function gradeOpenAnswerAction(input: {
  prompt: string;
  modelAnswer?: string;
  studentAnswer: string;
  maxPoints: number;
}): Promise<GradeOpenResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!anthropicConfig.isConfigured) return { ok: false, error: "AI non configurata." };
  try {
    const system =
      "You grade open-ended answers for a Sake Sommelier exam. Be strict but fair. Return ONLY JSON {\"score\": number, \"feedback\": string} where score is between 0 and the given maximum.";
    const user = `Question: ${input.prompt}\nModel answer / rubric: ${input.modelAnswer || "(none provided)"}\nMaximum points: ${input.maxPoints}\nStudent answer: ${input.studentAnswer}`;
    const raw = await callClaude({ system, user, maxTokens: 1024 });
    const r = parseJsonFromClaude<{ score: number; feedback: string }>(raw);
    return { ok: true, score: Math.max(0, Math.min(input.maxPoints, r.score)), feedback: r.feedback };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Valutazione non riuscita." };
  }
}
