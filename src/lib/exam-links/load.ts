// Service-role loader for the PUBLIC exam runner. Server-only.
//
// The exam link is reachable without a login, so the cookie-bound (anon) client
// is blocked by RLS. We use the service client to read just what the runner
// needs: the course header + the selected test's questions. Correct answers are
// NOT returned — only prompt + options.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { feedbackVariant } from "@/lib/domain";
import type { CourseTypeKey } from "@/lib/domain";
import { loadFeedbackSetWithTranslations } from "@/lib/esami/feedback-sets-actions";
import type { ExamTestKey } from "./token";

export type RunnerI18n = Partial<Record<"en" | "ja", { text: string; options: string[] }>>;
export interface PublicRunnerQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Question category (exam_categories label) — the KB-section key that lets
   *  AI grading constrain retrieval to the right chapter. */
  cat?: string;
  /** Question weight from the template (points ?? 1) — the Correggi engine sums
   *  scores by points, so it must travel with the question like `cat` does. */
  points?: number;
  /** Flagged "importante" in the template — wrong answers on these questions
   *  lead the correction report. */
  important?: boolean;
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
  /** "order" questions: the items in the CORRECT sequence (editor field). */
  items?: string[];
  correct?: Array<number | string>;
  imageId?: string;
  cat?: string;
  points?: number;
  important?: boolean;
}
interface MiniJson {
  day: number;
  questions?: QJson[];
}

// Image questions store the label/bottle image as a URL that the educator
// pastes into the editor (see ExamLibraryEditor: the field is a plain "URL
// immagine (https://…)" input, and the editor renders <img src={imageId}>).
// There is no Supabase Storage upload pipeline in this codebase — nothing to
// resolve a bare storage key against — so we pass the value through UNCHANGED,
// but only when it actually looks like a usable image URL. This guards against
// a stray non-URL value (e.g. a legacy bare id) turning into a broken <img> on
// an "image" question, which auto-grades and would mark the student wrong.
function toImageUrl(raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  // Accept absolute http(s), protocol-relative, root-relative, and data URLs.
  if (/^(https?:\/\/|\/\/|\/|data:image\/)/i.test(v)) return v;
  return undefined;
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

// Deterministic Fisher-Yates keyed on the question id: every student sees the
// SAME scrambled arrangement (fair + reproducible for grading review), but it
// is never the correct sequence itself — OrderInput auto-commits the initial
// arrangement, so serving the solution as the start state would hand out full
// marks for doing nothing.
function seededShuffle(arr: string[], seed: string): string[] {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Tiny arrays can shuffle back into the solution — rotate one step instead.
  if (out.length > 1 && out.every((v, i) => v === arr[i])) out.push(out.shift() as string);
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
      // "order": the editor stores the items in the CORRECT sequence in
      // `items` (this loader used to drop them → the runner fell back to a
      // textarea). Serve them SCRAMBLED as the options; the correct key is the
      // original sequence. Translations, when present, get the same permutation
      // so display stays aligned.
      const isOrder = q.type === "order" && Array.isArray(q.items) && q.items.length > 0;
      const options = isOrder ? seededShuffle(q.items!, id) : (q.options ?? []);
      // Keep correct as-is: numeric indices for choice questions, accepted answer
      // STRINGS for "fill" (filtering to numbers used to drop the fill answers).
      const correct = isOrder ? q.items! : (q.correct ?? []);
      const image = toImageUrl(q.imageId);
      let i18nOut = i18n;
      if (isOrder && i18n) {
        const perm = options.map((o) => q.items!.indexOf(o));
        i18nOut = Object.fromEntries(
          Object.entries(i18n).map(([lg, tr]) => [
            lg,
            tr && Array.isArray(tr.options) && tr.options.length === q.items!.length
              ? { ...tr, options: perm.map((ix) => tr.options[ix]) }
              : tr,
          ]),
        ) as typeof i18n;
      }
      return {
        id,
        type: q.type,
        text: q.text ?? "",
        options,
        points: q.points ?? 1,
        ...(q.important ? { important: true } : {}),
        ...(q.cat ? { cat: q.cat } : {}),
        ...(i18nOut ? { i18n: i18nOut } : {}),
        ...(image ? { image } : {}),
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
      // Legacy questions predate weights → every question counts one point.
      points: 1,
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
    .select("id, short_title, city, delivery_mode, month, year, educator_id, type")
    .eq("id", Number(courseId))
    .maybeSingle();
  if (!corso) return null;
  const courseType = ((corso.type as string) ?? "introduttivo") as CourseTypeKey;

  let educator = "";
  if (corso.educator_id) {
    const { data: edu } = await sb
      .from("educators")
      .select("full_name")
      .eq("id", corso.educator_id)
      .maybeSingle();
    educator = edu?.full_name ?? "";
  }

  let questions: PublicRunnerQuestion[] = [];
  if (testKey === "feedback") {
    // Feedback is VARIANT-based (short/long) and family-independent, so every
    // course type has feedback (Intro/Masterclass too). The variant is chosen
    // from the course type; the "long" set falls back to the certificato
    // template's feedback until saved standalone (so nothing is lost).
    const variant = feedbackVariant(courseType);
    const { questions: setQs, translations } = await loadFeedbackSetWithTranslations(variant);
    questions = mapQuestions(
      setQs as unknown as QJson[],
      `q-fb-${variant}`,
      includeAnswers,
      translations,
    );
  } else {
    // final / dayN → the per-family exam template (unchanged). DB
    // exam_templates.family is 'certificato' | 'shochu'.
    const dbFamily = family === "shochu" ? "shochu" : "certificato";
    const { data: tpl } = await sb
      .from("exam_templates")
      .select("id, data")
      .eq("family", dbFamily)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
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
      } else {
        const m = /^day(\d+)$/.exec(testKey);
        if (m) {
          const day = Number(m[1]);
          const mt = (data.miniTests ?? []).find((x) => x.day === day);
          questions = mapQuestions(mt?.questions ?? [], `q-${tpl.id}-d${day}`, includeAnswers, trans);
        }
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
