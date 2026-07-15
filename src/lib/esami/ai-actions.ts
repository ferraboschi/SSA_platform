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
import { ensureRagWired, setGradingModel, ClaudeGradingModel, gradeOpenAnswer } from "@/lib/rag";
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
  /** "order" questions store the sequence here — translated as options. */
  items?: string[];
  choices?: Array<{ text: string }>;
}
interface RawData {
  questions?: RawQ[];
  miniTests?: Array<{ day: number; questions?: RawQ[] }>;
  feedback?: { questions?: RawQ[] };
  translations?: Record<
    string,
    Partial<Record<TLang, { text: string; options: string[] }>> & { src?: string }
  >;
  [k: string]: unknown;
}

/** Source fingerprint of a question (text + options, order included): when it
 *  matches the stored one, the existing translation is still fresh and the
 *  question is SKIPPED — re-running Traduci after touching two questions costs
 *  two questions, not the whole bank. */
function srcHash(q: { text: string; options: string[] }): string {
  const src = `${q.text}\u0000${q.options.join("\u0000")}`;
  let h = 2166136261;
  for (const ch of src) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// Same id scheme as loadPublicExam, so stored translations match at runtime.
function extractQuestions(data: RawData, rowId: number): QForT[] {
  const out: QForT[] = [];
  const push = (q: RawQ, id: string) => {
    const text = q.text ?? q.prompt ?? "";
    // Ordering questions keep their sequence in `items` — those strings are
    // what the runner shows, so they're what gets translated.
    const options = q.options ?? q.items ?? (q.choices ? q.choices.map((c) => c.text) : []);
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
  // DELTA: skip questions whose source fingerprint matches the stored one and
  // whose translations already exist — the typical re-run (a couple of edited
  // questions) shrinks from the whole bank to just those.
  const pending = qs.filter((q) => {
    const t = translations[q.id];
    return !(t?.src === srcHash(q) && t.en && t.ja);
  });
  try {
    const jobs: Array<{ lang: TLang; part: QForT[] }> = [];
    for (const lang of ["en", "ja"] as TLang[]) {
      for (const part of chunk(pending, 25)) jobs.push({ lang, part });
    }
    // Limited parallelism (3 in flight): minutes → ~1 min on a full bank,
    // without hammering the provider's rate limits.
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const job = jobs[cursor++];
        if (!job) return;
        const system = `You are a professional translator for a Sake Sommelier certification exam. Translate from Italian to ${LANG_NAMES[job.lang]}. Preserve the meaning precisely and keep sake/Japanese technical terms accurate. Return ONLY a JSON array of the same length and order, each item {"id": string, "text": string, "options": string[]} with the options translated in the SAME order. No commentary, no code fences.`;
        const raw = await callClaude({ system, user: JSON.stringify(job.part), maxTokens: 8192 });
        const out = parseJsonFromClaude<QForT[]>(raw);
        for (const item of out) {
          if (!item?.id) continue;
          translations[item.id] = {
            ...(translations[item.id] ?? {}),
            [job.lang]: { text: item.text, options: item.options ?? [] },
          };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
    // Stamp the fingerprints AFTER both languages landed.
    for (const q of pending) {
      const t = translations[q.id];
      if (t?.en && t?.ja) t.src = srcHash(q);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Traduzione non riuscita." };
  }

  // The translation loop above can run for MINUTES — long enough for someone to
  // save question edits in the meantime. A blind write-back of the stale blob
  // would silently revert those edits (Bug 4's sneakiest window). So: re-read
  // the FRESH data, graft only `translations` onto it, and compare-and-swap on
  // data.__v — retrying against further concurrent saves a few times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: freshRow } = await svc
      .from("exam_templates")
      .select("id, data")
      .eq("id", row.id)
      .maybeSingle();
    const fresh = (freshRow?.data ?? {}) as RawData & { __v?: number };
    const expected = typeof fresh.__v === "number" ? fresh.__v : 0;
    let q = svc
      .from("exam_templates")
      .update({ data: { ...fresh, translations, __v: expected + 1 } })
      .eq("id", row.id);
    q = expected === 0 ? q.or("data->>__v.is.null,data->>__v.eq.0") : q.eq("data->>__v", String(expected));
    const { data: updated, error } = await q.select("id");
    if (error) return { ok: false, error: error.message };
    if ((updated ?? []).length > 0) {
      revalidatePath("/esami/editor");
      return { ok: true, count: pending.length };
    }
    // Someone saved between our read and write — loop re-reads and retries.
  }
  return { ok: false, error: "Traduzioni pronte ma salvataggio in conflitto: riprova la traduzione." };
}

export interface GradeOpenResult {
  ok: boolean;
  score?: number;
  /** AI vote on the 1-5 scale (1 = wrong, 5 = perfect). */
  vote?: number;
  feedback?: string;
  error?: string;
  /** True when the grade was grounded in retrieved SSA knowledge-base passages. */
  grounded?: boolean;
  confidence?: number;
  /** The KB passages the grade relied on (title + similarity), for audit. */
  citations?: { title: string; score: number }[];
}

/**
 * AI-grade an open-ended answer (0..maxPoints), GROUNDED in the SSA knowledge
 * base. Retrieves the relevant corpus passages and grades strictly against them;
 * if nothing relevant is found it REFUSES (score 0, grounded:false) and routes to
 * manual review — it never grades on the model's outside knowledge.
 */
export async function gradeOpenAnswerAction(input: {
  prompt: string;
  modelAnswer?: string;
  studentAnswer: string;
  maxPoints: number;
  /** KB section (the question's category) to constrain retrieval to; omit to
   *  search the whole corpus. */
  kbSection?: string;
}): Promise<GradeOpenResult> {
  if (!(await hasRole(["admin", "manager"]))) return { ok: false, error: "Non autorizzato." };
  if (!anthropicConfig.isConfigured) return { ok: false, error: "AI non configurata." };
  try {
    ensureRagWired();
    setGradingModel(new ClaudeGradingModel());
    const sug = await gradeOpenAnswer({
      question: input.prompt,
      answer: input.studentAnswer,
      rubricKey: input.modelAnswer,
      maxPoints: input.maxPoints,
      kbSection: input.kbSection,
    });
    return {
      ok: true,
      score: sug.suggestedPoints,
      vote: sug.vote,
      feedback: sug.rationale,
      grounded: sug.citations.length > 0,
      confidence: sug.confidence,
      citations: sug.citations.map((c) => ({ title: c.chunk.title, score: Math.round(c.score * 100) / 100 })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Valutazione non riuscita." };
  }
}
