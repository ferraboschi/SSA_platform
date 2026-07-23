// Pure exam-correction logic — no DB, no `server-only`, fully unit-testable.
// loadCourseExamResults (and the client preview) feed it questions + the
// student's stored answers and get back the graded breakdown + auto score.

import { EXAM_THRESHOLDS } from "@/lib/domain/constants";

export type ExamOutcome = "passed" | "retrial" | "failed";

/** Minimal question shape the grader needs (a subset of PublicRunnerQuestion). */
export interface GradableQuestion {
  id: string;
  type: string;
  text: string;
  options: string[];
  /** Question weight from the template (points ?? 1) — autoScore is weighted. */
  points?: number;
  /** Stored EN/JA translations. A student who took the exam in another language
   *  stored their answers as the TRANSLATED option text, so we must grade against
   *  the options in the language they actually saw — not the Italian original. */
  i18n?: Partial<Record<"en" | "ja", { text: string; options: string[] }>>;
  /** Option INDICES for choice questions, accepted STRINGS for "fill". */
  correct?: Array<number | string>;
}

/** The options the student ACTUALLY SAW, in their exam language — falling back to
 *  the original Italian when a translation is missing (exactly what the runner
 *  shows via localizeQ). Grading and the answer breakdown use these so a correct
 *  answer typed/picked in EN/JA is not compared against the Italian key. */
function seenOptions(q: GradableQuestion, lang?: string): string[] {
  if (lang === "en" || lang === "ja") {
    const tr = q.i18n?.[lang];
    if (tr?.options?.length) return tr.options;
  }
  return q.options;
}

export interface GradedAnswer {
  qid: string;
  type: string;
  text: string;
  given: string;
  correct: string;
  ok: boolean | null; // null = manual review (open/match/order, or fill w/o key)
  /** Earned share 0..1 for auto-graded questions — MULTI gives partial credit
   *  (owner batch 10), everything else is 0 or 1. Absent on manual rows. */
  fraction?: number;
  /** Left blank: counts as WRONG at full weight, and the UIs say "Non
   *  risposto" — never "in valutazione" (there is nothing to evaluate). */
  unanswered?: boolean;
}

export interface GradeResult {
  detail: GradedAnswer[];
  gradable: number; // count of auto-graded questions
  correct: number;
  manual: number; // count needing manual review
  autoScore: number; // 0–100 over the gradable questions
  suggested: ExamOutcome;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
const normStr = (s: unknown) => String(s ?? "").trim().toLowerCase();
const asArray = (given: string | string[] | undefined): string[] =>
  given == null ? [] : Array.isArray(given) ? given : [given];
const isBlank = (given: string | string[] | undefined): boolean =>
  asArray(given).every((v) => String(v).trim() === "");

/** Accepted FILL answers, split on comma, semicolon OR newline (owner batch 21).
 *  The editor stores what the author typed; a key entered as "taruzake;taru-zake;taru"
 *  would otherwise be ONE accepted string, so a student typing "taruzake" — a value
 *  literally in the list — was marked wrong. Splitting here fixes existing keys too. */
export function splitAccepted(correct: Array<number | string> | undefined): string[] {
  return (correct ?? [])
    .flatMap((c) => String(c).split(/[,;\n]+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** MULTI "either / or / both" rule (owner batch 17): when the answer key lists
 *  more than one correct option, naming ANY non-empty subset of them — and no
 *  wrong option — is fully correct. A bouquet that "suggests honjozo OR junmai"
 *  is answered right by naming just one of the two. Returns true only when every
 *  pick is a correct option and at least one pick was made; a single wrong pick
 *  disqualifies it (→ falls back to multiFraction's partial credit). */
export function isCorrectSubset(
  given: string | string[] | undefined,
  q: GradableQuestion,
): boolean {
  const correctSet = new Set(
    (q.correct ?? []).map((i) => normStr(q.options[Number(i)])).filter(Boolean),
  );
  if (correctSet.size === 0) return false;
  const picks = [...new Set(asArray(given).map(normStr).filter(Boolean))];
  if (picks.length === 0) return false;
  return picks.every((p) => correctSet.has(p));
}

/** Partial credit for MULTI (owner batch 10): the exact set earns 1; otherwise
 *  (right picks − wrong picks) / total right, floored at zero. */
export function multiFraction(
  given: string | string[] | undefined,
  q: GradableQuestion,
): number {
  const correctSet = new Set(
    (q.correct ?? []).map((i) => normStr(q.options[Number(i)])).filter(Boolean),
  );
  if (correctSet.size === 0) return 0;
  const picks = [...new Set(asArray(given).map(normStr).filter(Boolean))];
  let hits = 0;
  let wrong = 0;
  for (const g of picks) (correctSet.has(g) ? hits++ : wrong++);
  return Math.max(0, hits - wrong) / correctSet.size;
}

/** Human-readable correct answer for a question, per type ("—" when keyless). */
function correctDisplay(q: GradableQuestion, localized: GradableQuestion): string {
  if (q.type === "fill") return splitAccepted(q.correct).join(", ") || "—";
  if (q.type === "order") return (q.correct ?? []).map(String).join(" → ") || "—";
  if (isObjective(q.type) && q.correct?.length) {
    // SINGLE shows only ONE correct option — even when the key accepts several
    // ("Abilita più risposte corrette"), the student must never learn there was
    // more than one right answer (owner). MULTI legitimately lists them all.
    const idxs = q.type === "single" ? q.correct.slice(0, 1) : q.correct;
    return idxs.map((i) => localized.options[Number(i)]).filter(Boolean).join(", ") || "—";
  }
  return "—";
}

/** Auto-gradable choice types. Open / match / order go to manual review. */
export const isObjective = (t: string): boolean =>
  t === "single" || t === "multi" || t === "truefalse" || t === "image";

/** Grade a choice question. The runner stores the selected option TEXT, so we
 *  compare the given TEXTS to the correct option texts; we also accept index
 *  storage (legacy answers) by comparing against the raw indices. */
export function gradeObjective(given: string | string[] | undefined, q: GradableQuestion): boolean {
  const correctIdx = q.correct ?? [];
  const givenSet = new Set(asArray(given).map(normStr).filter(Boolean));
  const correctTextSet = new Set(correctIdx.map((i) => normStr(q.options[Number(i)])).filter(Boolean));
  // The runner stores the selected option TEXT — match on that first.
  if (correctTextSet.size > 0 && setsEqual(givenSet, correctTextSet)) return true;
  // Legacy fallback: some old submissions stored option INDICES. Accept that reading
  // only when the given values are NOT themselves option texts — otherwise a numeric
  // option label (e.g. "1") could collide with a correct index and false-positive.
  const optionTextSet = new Set(q.options.map(normStr));
  const givenAreNotOptionTexts = [...givenSet].every((g) => !optionTextSet.has(g));
  if (givenAreNotOptionTexts) {
    const correctIdxSet = new Set(correctIdx.map((i) => normStr(i)));
    return correctIdxSet.size > 0 && setsEqual(givenSet, correctIdxSet);
  }
  return false;
}

/** Human-readable rendering of a given answer (maps legacy indices → text). */
export function fmtGiven(given: string | string[] | undefined, q: GradableQuestion): string {
  if (given == null || (Array.isArray(given) && given.length === 0)) return "—";
  const arr = asArray(given);
  if (q.options.length) {
    const labels = arr.map((v) => {
      const n = Number(v);
      return Number.isInteger(n) && q.options[n] != null ? q.options[n] : v;
    });
    return labels.join(", ");
  }
  return arr.join(", ");
}

/** Map a score (0–100) to the suggested outcome via the SSA thresholds. Rounds
 *  to the nearest integer first (a no-op for the count-based autoScore, but it
 *  makes 79.5 → 80 → promosso), so this is the ONE score→outcome rule — the
 *  correction's verdictFromPct and every UI copy delegate here. */
export function scoreToOutcome(autoScore: number): ExamOutcome {
  const s = Math.round(autoScore);
  return s >= EXAM_THRESHOLDS.pass * 100
    ? "passed"
    : s >= EXAM_THRESHOLDS.retrial * 100
      ? "retrial"
      : "failed";
}

/** The objective percentage to CERTIFY alongside a (possibly manual) outcome —
 *  or `null` when no number should be stored/shown:
 *   • `gradable === 0` → no auto-gradable questions: the outcome is a fully manual
 *     decision and there is no objective score (avoids a meaningless "0%").
 *   • the chosen `outcome` ≠ what the auto-score implies (operator override) → the
 *     objective % would contradict the decision (avoids e.g. "Bocciato 85%").
 *  Persisted into `exam_score_pct`; every consumer renders "%" only when non-null. */
export function certifiedScore(
  gradable: number,
  autoScore: number,
  outcome: ExamOutcome,
): number | null {
  if (gradable <= 0) return null;
  if (scoreToOutcome(autoScore) !== outcome) return null;
  return autoScore;
}

/** Grade a whole submission: per-question breakdown + auto score + suggestion. */
export function gradeAnswers(
  questions: GradableQuestion[],
  answers: Record<string, string | string[]> | null | undefined,
  /** The language the student took the exam in ("it" | "en" | "ja"). Their answers
   *  were stored in this language, so each question is graded against the options
   *  they actually saw. Omit / "it" for the Italian original. */
  lang?: string,
): GradeResult {
  const ans = answers ?? {};
  let gradable = 0;
  let correct = 0;
  let manual = 0;
  // POINTS-weighted score (owner batch 8): a 3-point question moves the
  // percentage three times as much as a 1-point one, matching the batch
  // correction's combinedPct semantics.
  let gradablePts = 0;
  let correctPts = 0;

  // "chapter" is a communication slide, not a question: drop it before grading
  // so it never counts toward gradable/total/score, sections, or any answer list
  // (this is the single choke point every consumer reads through).
  const detail: GradedAnswer[] = questions.filter((q) => q.type !== "chapter").map((q) => {
    const given = ans[q.id];
    // Grade against the version the student SAW (their language), so an answer
    // stored as translated option text matches the (translated) correct option.
    const localized: GradableQuestion = { ...q, options: seenOptions(q, lang) };
    // Show the QUESTION TEXT in the language the student sat the exam in (debug
    // call): the staff Esiti + resoconto used to show Italian text on an EN/JA
    // exam. Falls back to the Italian original when a translation is missing —
    // exactly what the runner's localizeQ / buildDayEsito do.
    const qText =
      (lang === "en" || lang === "ja") && q.i18n?.[lang]?.text ? q.i18n[lang]!.text : q.text;

    // UNANSWERED = wrong, for EVERY type (owner batch 10): full weight in the
    // denominator, zero earned, and NO review lane — a blank has nothing to
    // evaluate, so it must never sit "in valutazione" nor reach the AI.
    if (isBlank(given)) {
      gradable++;
      gradablePts += q.points ?? 1;
      return {
        qid: q.id,
        type: q.type,
        text: qText,
        given: "—",
        correct: correctDisplay(q, localized),
        ok: false,
        fraction: 0,
        unanswered: true,
      };
    }

    // FILL ("Riempi spazio"): the typed answer is matched, case-insensitive,
    // against the accepted strings (q.correct). Deterministic → auto-graded.
    if (q.type === "fill") {
      const accepted = splitAccepted(q.correct).map(normStr).filter(Boolean);
      // Accepted answers exist in Italian only. If the student saw a TRANSLATED
      // version of this question there is no localized key to compare against →
      // route to manual review (never auto-fail a correct EN/JA answer vs the IT key).
      const sawTranslated = (lang === "en" || lang === "ja") && !!q.i18n?.[lang];
      if (accepted.length === 0 || sawTranslated) {
        manual++;
        return { qid: q.id, type: q.type, text: qText, given: fmtGiven(given, localized), correct: "—", ok: null };
      }
      const givenNorm = normStr(Array.isArray(given) ? given[0] : given);
      const exact = givenNorm !== "" && accepted.includes(givenNorm);
      if (exact) {
        gradable++;
        gradablePts += q.points ?? 1;
        correct++;
        correctPts += q.points ?? 1;
        return {
          qid: q.id,
          type: q.type,
          text: qText,
          given: fmtGiven(given, localized),
          correct: splitAccepted(q.correct).join(", "),
          ok: true,
          fraction: 1,
        };
      }
      // Owner batch 21: an ANSWERED fill that doesn't match the key exactly is NOT
      // auto-failed — a paraphrase or more-complete answer ("distillato a base di
      // vari cereali" vs "distillato") goes to the GENEROUS AI (like an open
      // question), graded against the accepted answer as reference (passed as
      // rubricKey by correction-run). Blanks were already closed as ok=false above
      // (isBlank), so only genuinely-answered misses reach here → ok=null.
      manual++;
      return {
        qid: q.id,
        type: q.type,
        text: qText,
        given: fmtGiven(given, localized),
        correct: splitAccepted(q.correct).join(", "),
        ok: null,
      };
    }

    // ORDER: deterministic — the answer is the arrangement (array of option
    // texts), the key is the correct sequence (strings). All-or-nothing.
    // Legacy free-text answers (from when the runner fell back to a textarea)
    // are strings, not arrays → manual review, never auto-failed.
    if (q.type === "order") {
      const key = (q.correct ?? []).map(String);
      const arr = Array.isArray(given) ? given : null;
      const sawTranslated = (lang === "en" || lang === "ja") && !!q.i18n?.[lang];
      if (key.length > 0 && arr && arr.length === key.length && !sawTranslated) {
        gradable++;
        gradablePts += q.points ?? 1;
        const ok = key.every((k, idx) => normStr(k) === normStr(arr[idx]));
        if (ok) {
          correct++;
          correctPts += q.points ?? 1;
        }
        return {
          qid: q.id,
          type: q.type,
          text: qText,
          given: fmtGiven(given, localized),
          correct: key.join(" → "),
          ok,
          fraction: ok ? 1 : 0,
        };
      }
      // Translated sitting: compare against the translated sequence the student saw.
      if (key.length > 0 && arr && sawTranslated) {
        const trOpts = q.i18n?.[lang as "en" | "ja"]?.options ?? [];
        // Rebuild the translated correct sequence: same permutation logic as the
        // loader (options are the translated ITEMS, aligned index-by-index with
        // q.options which is the scrambled arrangement) — grade only when the
        // translated key can be derived unambiguously.
        if (trOpts.length === q.options.length && arr.length === key.length) {
          const toTranslated = new Map(q.options.map((o, ix) => [normStr(o), normStr(trOpts[ix])]));
          const trKey = key.map((k) => toTranslated.get(normStr(k)) ?? "");
          if (trKey.every(Boolean)) {
            gradable++;
            gradablePts += q.points ?? 1;
            const ok = trKey.every((k, idx) => k === normStr(arr[idx]));
            if (ok) {
              correct++;
              correctPts += q.points ?? 1;
            }
            return {
              qid: q.id,
              type: q.type,
              text: qText,
              given: fmtGiven(given, localized),
              correct: key.join(" → "),
              ok,
            };
          }
        }
      }
      manual++;
      return { qid: q.id, type: q.type, text: qText, given: fmtGiven(given, localized), correct: key.length ? key.join(" → ") : "—", ok: null };
    }

    // Open / match (or a choice question with no answer key) → manual.
    // An EMPTY key ([]) is "no key" too — never auto-fail the whole class on it
    // (mirrors the fill branch's `accepted.length === 0` guard above).
    if (!isObjective(q.type) || !q.correct || q.correct.length === 0) {
      manual++;
      return { qid: q.id, type: q.type, text: qText, given: fmtGiven(given, localized), correct: "—", ok: null };
    }

    // Objective choice question → auto-graded, in the student's language.
    // MULTI earns PARTIAL credit (owner batch 10): the exact set is the full
    // point, anything else scores proportionally via multiFraction.
    gradable++;
    gradablePts += q.points ?? 1;
    // MULTI "either/or/both" (owner batch 17): when the key lists exactly TWO
    // correct options, naming a non-empty subset of them (no wrong pick) is fully
    // correct — "il bouquet suggerisce honjozo O junmai" is answered by naming
    // one. Keys with 3+ correct options keep batch 10's partial credit (a
    // "select-all" question isn't satisfied by one pick).
    const ok =
      gradeObjective(given, localized) ||
      // SINGLE with more than one correct option (owner "Abilita più risposte
      // corrette"): the student picks exactly one, and any correct pick earns
      // full marks → membership, not exact-set. Harmless for a normal single
      // (one correct): membership ≡ exact when the key has a single option.
      (q.type === "single" && isCorrectSubset(given, localized)) ||
      (q.type === "multi" && (q.correct?.length ?? 0) === 2 && isCorrectSubset(given, localized));
    const fraction = ok ? 1 : q.type === "multi" ? multiFraction(given, localized) : 0;
    correctPts += fraction * (q.points ?? 1);
    if (ok) correct++;
    return {
      qid: q.id,
      type: q.type,
      text: qText,
      given: fmtGiven(given, localized),
      // SINGLE shows a single correct option (see correctDisplay) so a
      // multi-correct key never reveals it accepted more than one.
      correct: correctDisplay(q, localized),
      ok,
      fraction,
    };
  });

  const autoScore = gradablePts ? Math.round((correctPts / gradablePts) * 100) : 0;
  return { detail, gradable, correct, manual, autoScore, suggested: scoreToOutcome(autoScore) };
}
