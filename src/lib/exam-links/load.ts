// Service-role loader for the PUBLIC exam runner. Server-only.
//
// The exam link is reachable without a login, so the cookie-bound (anon) client
// is blocked by RLS. We use the service client to read just what the runner
// needs: the course header + the selected test's questions. Correct answers are
// NOT returned — only prompt + options.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { ExamTestKey } from "./token";

export type RunnerI18n = Partial<Record<"en" | "ja", { text: string; options: string[] }>>;
export interface PublicRunnerQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Stored EN/JA translations (Claude, one-time) — runner renders by language. */
  i18n?: RunnerI18n;
  /** Correct answers — option INDICES for choice questions, accepted STRINGS for
   *  "fill". Populated in validate mode and for grading (includeAnswers). */
  correct?: Array<number | string>;
  /** Image URL for "image" (identify) questions — shown above the options. */
  image?: string;
}
type TransMap = Record<string, RunnerI18n>;
export interface PublicRunnerData {
  header: {
    courseName: string;
    place: string;
    date: string;
    educator: string;
  };
  questions: PublicRunnerQuestion[];
}

interface QJson {
  // legacy
  prompt?: string;
  choices?: Array<{ text: string; correct: boolean }>;
  // rich (editor-saved)
  id?: string;
  type?: string;
  text?: string;
  options?: string[];
  correct?: Array<number | string>;
  imageId?: string;
}
interface MiniJson {
  day: number;
  questions?: QJson[];
}

// Drop duplicate questions by normalized text (a re-imported bank duplicates
// text with regenerated ids). Keeps the first occurrence so the student sees
// each question once.
function dedupByText(qs: PublicRunnerQuestion[]): PublicRunnerQuestion[] {
  const seen = new Set<string>();
  const out: PublicRunnerQuestion[] = [];
  for (const q of qs) {
    const key = (q.text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(q);
  }
  return out;
}

function mapQuestions(
  raw: QJson[],
  prefix: string,
  includeAnswers: boolean,
  trans?: TransMap,
): PublicRunnerQuestion[] {
  return dedupByText(raw.map((q, i) => {
    const id = q.id ?? `${prefix}-${i}`;
    const i18n = trans?.[id];
    // Rich shape → use stored type/options/correct directly.
    if (q.type) {
      const options = q.options ?? [];
      // Keep correct as-is: numeric indices for choice questions, accepted answer
      // STRINGS for "fill" (filtering to numbers used to drop the fill answers).
      const correct = q.correct ?? [];
      return {
        id,
        type: q.type,
        text: q.text ?? "",
        options,
        ...(i18n ? { i18n } : {}),
        ...(q.imageId ? { image: q.imageId } : {}),
        ...(includeAnswers ? { correct } : {}),
      };
    }
    // Legacy shape.
    const choices = q.choices ?? [];
    const correctCount = choices.filter((c) => c.correct).length;
    const correct = choices
      .map((c, idx) => (c.correct ? idx : -1))
      .filter((x) => x >= 0);
    return {
      id,
      type: choices.length === 0 ? "open" : correctCount > 1 ? "multi" : "single",
      text: q.prompt ?? "",
      options: choices.map((c) => c.text),
      ...(i18n ? { i18n } : {}),
      ...(includeAnswers ? { correct } : {}),
    };
  }));
}

export async function loadPublicExam(
  courseId: string,
  family: "nihonshu" | "shochu",
  testKey: ExamTestKey,
  includeAnswers = false,
): Promise<PublicRunnerData | null> {
  const sb = getSupabaseServiceClient();

  const { data: corso } = await sb
    .from("corsi")
    .select("id, short_title, city, delivery_mode, month, year, educator_id")
    .eq("id", Number(courseId))
    .maybeSingle();
  if (!corso) return null;

  let educator = "";
  if (corso.educator_id) {
    const { data: edu } = await sb
      .from("educators")
      .select("full_name")
      .eq("id", corso.educator_id)
      .maybeSingle();
    educator = edu?.full_name ?? "";
  }

  // DB exam_templates.family is 'certificato' | 'shochu'.
  const dbFamily = family === "shochu" ? "shochu" : "certificato";
  const { data: tpl } = await sb
    .from("exam_templates")
    .select("id, data")
    .eq("family", dbFamily)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  let questions: PublicRunnerQuestion[] = [];
  if (tpl) {
    const data = tpl.data as {
      questions?: QJson[];
      miniTests?: MiniJson[];
      feedback?: { questions?: QJson[] };
      translations?: TransMap;
    };
    const trans = data.translations;
    if (testKey === "final") {
      questions = mapQuestions(data.questions ?? [], `q-${tpl.id}`, includeAnswers, trans);
    } else if (testKey === "feedback") {
      questions = mapQuestions(data.feedback?.questions ?? [], `q-${tpl.id}-fb`, includeAnswers, trans);
    } else {
      const m = /^day(\d+)$/.exec(testKey);
      if (m) {
        const day = Number(m[1]);
        const mt = (data.miniTests ?? []).find((x) => x.day === day);
        questions = mapQuestions(mt?.questions ?? [], `q-${tpl.id}-d${day}`, includeAnswers, trans);
      }
    }
  }

  return {
    header: {
      courseName: corso.short_title,
      place: corso.delivery_mode === "online" ? "Online" : corso.city,
      date: `${corso.month} ${corso.year}`,
      educator,
    },
    questions,
  };
}
