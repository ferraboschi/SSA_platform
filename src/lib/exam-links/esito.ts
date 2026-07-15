import "server-only";

// Day-test FORMATIVE result (owner, batch 7): the giorno-N tests are paid
// study aids, so the student sees their outcome right after handing in and on
// every re-open of the link (until the educator closes it). Graded server-side
// with the same pure grader the staff Esiti tab uses — the student can never
// see a different score than the operator. The FINAL exam never goes through
// here: its outcome stays private until the official correction.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadPublicExam } from "./load";
import { gradeAnswers } from "./grading";
import type { ExamTestKey } from "./token";
import { correctionKey, type CorrectionDraft } from "@/lib/esami/correction-types";

export interface DayEsitoItem {
  qid: string;
  /** Question text in the language the student sat the test in. */
  text: string;
  given: string;
  /** Correct answer/sequence ("—" for manually-reviewed types). */
  correctText: string;
  /** true/false = auto-graded; null = pending manual/AI review. */
  ok: boolean | null;
  /** AI evaluation from the submit-time correction (owner batch 8). */
  aiVote?: number;
  aiPoints?: number;
  aiMaxPoints?: number;
  aiRationale?: string;
  aiFailed?: boolean;
}

export interface DayEsito {
  /** null when the test has no auto-gradable questions. */
  pct: number | null;
  outcome: "passed" | "retrial" | "failed" | null;
  correct: number;
  gradable: number;
  manual: number;
  /** Open answers exist but their AI evaluation hasn't landed yet — the card
   *  shows the wait note and polls until the draft arrives. */
  aiPending?: boolean;
  detail: DayEsitoItem[];
}

export async function buildDayEsito(
  courseRef: string,
  family: "nihonshu" | "shochu",
  testKey: string,
  answers: Record<string, string | string[]> | null | undefined,
  lang?: string | null,
  /** When the submission id is known, the submit-time AI draft (same store as
   *  the staff batch) is joined in: votes per open answer + combined score. */
  submissionId?: number,
): Promise<DayEsito | null> {
  if (!/^day[1-9]$/.test(testKey)) return null;
  const data = await loadPublicExam(courseRef, family, testKey as ExamTestKey, true);
  if (!data || data.questions.length === 0) return null;

  const lg = lang === "en" || lang === "ja" ? lang : "it";
  const res = gradeAnswers(data.questions, answers, lg);
  const textById = new Map(
    data.questions.map((q) => [q.id, (lg !== "it" && q.i18n?.[lg]?.text) || q.text]),
  );

  // Submit-time AI draft, when it already landed (written in the background
  // right after hand-in).
  let draft: CorrectionDraft | null = null;
  const corsoId = /^\d+$/.test(courseRef) ? Number(courseRef) : null;
  if (submissionId != null && corsoId != null) {
    try {
      const svc = getSupabaseServiceClient();
      const { data: row } = await svc
        .from("settings_kv")
        .select("value")
        .eq("key", correctionKey(corsoId, submissionId))
        .maybeSingle();
      draft = (row?.value as CorrectionDraft | null) ?? null;
    } catch {
      draft = null;
    }
  }
  const gradeByQid = new Map((draft?.openGrades ?? []).map((g) => [g.qid, g]));

  const hasOpenAnswers = res.detail.some(
    (d) => d.ok === null && d.given !== "" && d.given !== "—",
  );
  // With the AI draft in, the combined (points-weighted, AI included) score is
  // the student's real number; before it lands, the weighted objective score.
  const pct = draft ? draft.combinedPct : res.gradable ? res.autoScore : null;
  const outcome =
    pct == null ? null : pct >= 80 ? "passed" : pct >= 70 ? "retrial" : "failed";
  return {
    pct,
    outcome,
    correct: res.correct,
    gradable: res.gradable,
    manual: res.manual,
    aiPending: hasOpenAnswers && !draft && submissionId != null,
    detail: res.detail.map((d) => {
      const g = d.ok === null ? gradeByQid.get(d.qid) : undefined;
      return {
        qid: d.qid,
        text: textById.get(d.qid) ?? d.text,
        given: d.given,
        correctText: d.correct,
        ok: d.ok,
        ...(g && !g.failed
          ? { aiVote: g.vote, aiPoints: g.points, aiMaxPoints: g.maxPoints, aiRationale: g.rationale }
          : g?.failed
            ? { aiFailed: true }
            : {}),
      };
    }),
  };
}
