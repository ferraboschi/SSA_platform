import "server-only";

// Read real exam submissions for a course, auto-grade them via the pure grading
// module, and link each to the student's enrollment so the operator can confirm
// the outcome.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadPublicExam, type PublicRunnerQuestion } from "./load";
import { gradeAnswers, type ExamOutcome, type GradedAnswer } from "./grading";
import type { ExamTestKey } from "./token";

// Re-exported so existing importers keep `from "@/lib/exam-links/results"`.
export type { ExamOutcome, GradedAnswer };

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
  /** Language the student took the exam in (for a localized result email/PDF). */
  lang: string | null;
  answers: GradedAnswer[];
}

export async function loadCourseExamResults(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<GradedSubmission[]> {
  const svc = getSupabaseServiceClient();
  const { data: subs } = await svc
    .from("exam_submissions")
    .select("id, test_key, answers, registration, corsista_id, created_at, lang")
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
    corsista_id: number | null;
    created_at: string;
    lang: string | null;
  }>) {
    const reg = s.registration ?? {};
    let email = (
      reg.email || Object.values(reg).find((v) => typeof v === "string" && v.includes("@")) || ""
    )
      .toString()
      .toLowerCase()
      .trim();
    let name = reg.name || "—";
    const questions = await getQuestions(s.test_key);
    const ans = s.answers ?? {};

    // Auto-correction (pure, fully unit-tested in grading.test.ts).
    const { detail, gradable, manual, autoScore, suggested } = gradeAnswers(questions, ans, s.lang ?? undefined);

    let enrollmentId: number | null = null;
    let currentResult: string | null = null;
    let currentScore: number | null = null;

    const applyEnrollment = (e: unknown) => {
      const row = e as { id: number; exam_result: string | null; exam_score_pct: number | null } | null;
      if (!row) return;
      enrollmentId = row.id;
      currentResult = row.exam_result;
      currentScore = row.exam_score_pct;
    };

    // PRIMARY: proctored submissions carry corsista_id → resolve the student and
    // enrollment directly. This is the reliable tie-back even when the exam
    // collected no registration fields (name/email would otherwise be "—").
    if (s.corsista_id != null) {
      const { data: cor } = await svc
        .from("corsisti").select("full_name, email").eq("id", s.corsista_id).maybeSingle();
      if (cor) {
        // AUTHORITATIVE: a proctored submission is tied to the verified enrolled
        // student, so their corsista name/email win over anything in registration
        // — never show (or route a certificate to) a student-typed value.
        const c = cor as { full_name: string | null; email: string | null };
        if (c.full_name) name = c.full_name;
        if (c.email) email = c.email.toLowerCase().trim();
      }
      const { data: e } = await svc
        .from("corsi_iscrizioni")
        .select("id, exam_result, exam_score_pct")
        .eq("corsista_id", s.corsista_id)
        .eq("corso_id", Number(courseId))
        .maybeSingle();
      applyEnrollment(e);
    }

    // FALLBACK: legacy / non-proctored submissions only have an email → match it
    // case-insensitively (the stored corsista email may be mixed-case, while the
    // submission email was lowercased above — `.eq` would miss those rows).
    if (enrollmentId == null && email) {
      const { data: c } = await svc.from("corsisti").select("id").ilike("email", email).maybeSingle();
      if (c) {
        const { data: e } = await svc
          .from("corsi_iscrizioni")
          .select("id, exam_result, exam_score_pct")
          .eq("corsista_id", (c as { id: number }).id)
          .eq("corso_id", Number(courseId))
          .maybeSingle();
        applyEnrollment(e);
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
      lang: s.lang ?? null,
      answers: detail,
    });
  }
  return out;
}
