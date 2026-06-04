import "server-only";

// Read + auto-grade real exam submissions for a course, and link each to the
// student's enrollment so the operator can confirm the outcome.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { EXAM_THRESHOLDS } from "@/lib/domain/constants";
import { loadPublicExam, type PublicRunnerQuestion } from "./load";
import type { ExamTestKey } from "./token";

export type ExamOutcome = "passed" | "retrial" | "failed";

export interface GradedAnswer {
  qid: string;
  type: string;
  text: string;
  given: string;
  correct: string;
  ok: boolean | null; // null = manual (open/match/order)
}

export interface GradedSubmission {
  id: number;
  studentName: string;
  studentEmail: string;
  testKey: string;
  submittedAt: string;
  autoScore: number; // 0–100 over objective questions
  gradable: number;
  manualCount: number;
  suggested: ExamOutcome;
  enrollmentId: number | null;
  currentResult: string | null;
  currentScore: number | null;
  answers: GradedAnswer[];
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

const normStr = (s: unknown) => String(s ?? "").trim().toLowerCase();
const asArray = (given: string | string[] | undefined): string[] =>
  given == null ? [] : Array.isArray(given) ? given : [given];

// The public runner stores the selected option TEXT (not its index). So grade
// by comparing the given TEXTS to the correct option texts; fall back to index
// comparison for any legacy/index-stored answers. (Comparing by index against
// text answers is why every objective answer used to score 0%.)
function gradeObjective(given: string | string[] | undefined, q: PublicRunnerQuestion): boolean {
  const correctIdx = q.correct ?? [];
  const givenSet = new Set(asArray(given).map(normStr).filter(Boolean));
  const correctTextSet = new Set(
    correctIdx.map((i) => normStr(q.options[Number(i)])).filter(Boolean),
  );
  const correctIdxSet = new Set(correctIdx.map((i) => normStr(i)));
  return (
    (correctTextSet.size > 0 && setsEqual(givenSet, correctTextSet)) ||
    setsEqual(givenSet, correctIdxSet)
  );
}

function fmtGiven(given: string | string[] | undefined, q: PublicRunnerQuestion): string {
  if (given == null || (Array.isArray(given) && given.length === 0)) return "—";
  const arr = asArray(given);
  if (q.options.length) {
    // Answers are stored as option TEXT; map any legacy numeric indices to text.
    const labels = arr.map((v) => {
      const n = Number(v);
      return Number.isInteger(n) && q.options[n] != null ? q.options[n] : v;
    });
    return labels.join(", ");
  }
  return arr.join(", ");
}

const isObjective = (t: string) =>
  t === "single" || t === "multi" || t === "truefalse" || t === "image";

export async function loadCourseExamResults(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<GradedSubmission[]> {
  const svc = getSupabaseServiceClient();
  const { data: subs } = await svc
    .from("exam_submissions")
    .select("id, test_key, answers, registration, created_at")
    .eq("corso_id", Number(courseId))
    .eq("mode", "exam")
    .neq("test_key", "feedback")
    .order("created_at", { ascending: false });
  if (!subs || subs.length === 0) return [];

  const qCache = new Map<string, PublicRunnerQuestion[]>();
  const getQuestions = async (tk: string): Promise<PublicRunnerQuestion[]> => {
    if (!qCache.has(tk)) {
      const d = await loadPublicExam(courseId, family, tk as ExamTestKey, true);
      qCache.set(tk, d?.questions ?? []);
    }
    return qCache.get(tk)!;
  };

  const out: GradedSubmission[] = [];
  for (const s of subs as Array<{
    id: number;
    test_key: string;
    answers: Record<string, string | string[]> | null;
    registration: Record<string, string> | null;
    created_at: string;
  }>) {
    const reg = s.registration ?? {};
    const email = (
      reg.email || Object.values(reg).find((v) => typeof v === "string" && v.includes("@")) || ""
    )
      .toString()
      .toLowerCase()
      .trim();
    const name = reg.name || "—";
    const questions = await getQuestions(s.test_key);
    const ans = s.answers ?? {};

    let gradable = 0;
    let correct = 0;
    let manual = 0;
    const detail: GradedAnswer[] = questions.map((q) => {
      const given = ans[q.id];
      // FILL ("Riempi spazio"): the typed answer is matched, case-insensitive,
      // against the accepted answers (q.correct holds the accepted STRINGS). This
      // is deterministic → auto-graded, not sent to manual review.
      if (q.type === "fill") {
        const accepted = (q.correct ?? []).map((c) => normStr(c)).filter(Boolean);
        if (accepted.length === 0) {
          manual++;
          return { qid: q.id, type: q.type, text: q.text, given: fmtGiven(given, q), correct: "—", ok: null };
        }
        gradable++;
        const givenNorm = normStr(Array.isArray(given) ? given[0] : given);
        const ok = givenNorm !== "" && accepted.includes(givenNorm);
        if (ok) correct++;
        return {
          qid: q.id,
          type: q.type,
          text: q.text,
          given: fmtGiven(given, q),
          correct: (q.correct ?? []).map(String).join(", "),
          ok,
        };
      }
      if (!isObjective(q.type) || !q.correct) {
        manual++;
        return { qid: q.id, type: q.type, text: q.text, given: fmtGiven(given, q), correct: "—", ok: null };
      }
      gradable++;
      const ok = gradeObjective(given, q);
      if (ok) correct++;
      return {
        qid: q.id,
        type: q.type,
        text: q.text,
        given: fmtGiven(given, q),
        correct: q.correct.map((i) => q.options[Number(i)]).filter(Boolean).join(", "),
        ok,
      };
    });
    const autoScore = gradable ? Math.round((correct / gradable) * 100) : 0;
    const suggested: ExamOutcome =
      autoScore >= EXAM_THRESHOLDS.pass * 100
        ? "passed"
        : autoScore >= EXAM_THRESHOLDS.retrial * 100
          ? "retrial"
          : "failed";

    let enrollmentId: number | null = null;
    let currentResult: string | null = null;
    let currentScore: number | null = null;
    if (email) {
      const { data: c } = await svc.from("corsisti").select("id").eq("email", email).maybeSingle();
      if (c) {
        const { data: e } = await svc
          .from("corsi_iscrizioni")
          .select("id, exam_result, exam_score_pct")
          .eq("corsista_id", (c as { id: number }).id)
          .eq("corso_id", Number(courseId))
          .maybeSingle();
        if (e) {
          const row = e as { id: number; exam_result: string | null; exam_score_pct: number | null };
          enrollmentId = row.id;
          currentResult = row.exam_result;
          currentScore = row.exam_score_pct;
        }
      }
    }

    out.push({
      id: s.id,
      studentName: name,
      studentEmail: email,
      testKey: s.test_key,
      submittedAt: s.created_at,
      autoScore,
      gradable,
      manualCount: manual,
      suggested,
      enrollmentId,
      currentResult,
      currentScore,
      answers: detail,
    });
  }
  return out;
}
