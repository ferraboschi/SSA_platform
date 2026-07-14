import "server-only";

// Day-test FORMATIVE result (owner, batch 7): the giorno-N tests are paid
// study aids, so the student sees their outcome right after handing in and on
// every re-open of the link (until the educator closes it). Graded server-side
// with the same pure grader the staff Esiti tab uses — the student can never
// see a different score than the operator. The FINAL exam never goes through
// here: its outcome stays private until the official correction.

import { loadPublicExam } from "./load";
import { gradeAnswers } from "./grading";
import type { ExamTestKey } from "./token";

export interface DayEsitoItem {
  qid: string;
  /** Question text in the language the student sat the test in. */
  text: string;
  given: string;
  /** Correct answer/sequence ("—" for manually-reviewed types). */
  correctText: string;
  /** true/false = auto-graded; null = pending manual/AI review. */
  ok: boolean | null;
}

export interface DayEsito {
  /** null when the test has no auto-gradable questions. */
  pct: number | null;
  outcome: "passed" | "retrial" | "failed" | null;
  correct: number;
  gradable: number;
  manual: number;
  detail: DayEsitoItem[];
}

export async function buildDayEsito(
  courseRef: string,
  family: "nihonshu" | "shochu",
  testKey: string,
  answers: Record<string, string | string[]> | null | undefined,
  lang?: string | null,
): Promise<DayEsito | null> {
  if (!/^day[1-9]$/.test(testKey)) return null;
  const data = await loadPublicExam(courseRef, family, testKey as ExamTestKey, true);
  if (!data || data.questions.length === 0) return null;

  const lg = lang === "en" || lang === "ja" ? lang : "it";
  const res = gradeAnswers(data.questions, answers, lg);
  const textById = new Map(
    data.questions.map((q) => [q.id, (lg !== "it" && q.i18n?.[lg]?.text) || q.text]),
  );

  const pct = res.gradable ? Math.round((res.correct / res.gradable) * 100) : null;
  const outcome = pct == null ? null : pct >= 80 ? "passed" : pct >= 70 ? "retrial" : "failed";
  return {
    pct,
    outcome,
    correct: res.correct,
    gradable: res.gradable,
    manual: res.manual,
    detail: res.detail.map((d) => ({
      qid: d.qid,
      text: textById.get(d.qid) ?? d.text,
      given: d.given,
      correctText: d.correct,
      ok: d.ok,
    })),
  };
}
