import "server-only";

// Read real exam submissions for a course, auto-grade them via the pure grading
// module, and link each to the student's enrollment so the operator can confirm
// the outcome.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadPublicExam, type PublicRunnerQuestion } from "./load";
import { gradeAnswers, type ExamOutcome, type GradedAnswer as PureGradedAnswer } from "./grading";
import type { ExamTestKey } from "./token";

// Re-exported so existing importers keep `from "@/lib/exam-links/results"`.
export type { ExamOutcome };
/** The pure grader's per-question breakdown, plus the question's category — the
 *  KB-section key the results UI uses to constrain AI grading retrieval. */
export type GradedAnswer = PureGradedAnswer & { cat?: string };

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
  /** The bound corsista (proctored submissions) — keys the attendance map. */
  corsistaId: number | null;
  /** Set (and enrollmentId null) when the submission belongs to a "doppio"
   *  companion (corsi_partecipanti) instead of an enrolled corsista. */
  partecipanteId: number | null;
  currentResult: string | null;
  currentScore: number | null;
  /** Language the student took the exam in (for a localized result email/PDF). */
  lang: string | null;
  answers: GradedAnswer[];
}

/** Find the CONFIRMED result for an email — deterministic when a companion
 *  shares the buyer's email (same household): the enrolled corsista's row wins
 *  over a companion's, then the most recent. Pure (unit-tested). */
export function findConfirmedResultByEmail(
  subs: GradedSubmission[],
  email: string,
): GradedSubmission | null {
  const low = email.toLowerCase().trim();
  const matches = subs.filter(
    (s) => s.studentEmail.toLowerCase() === low && s.currentResult,
  );
  if (matches.length === 0) return null;
  const corsista = matches.find((s) => s.enrollmentId != null);
  return corsista ?? matches[0];
}

export async function loadCourseExamResults(
  courseId: string,
  family: "nihonshu" | "shochu",
): Promise<GradedSubmission[]> {
  const svc = getSupabaseServiceClient();
  // Try WITH partecipante_id; retry without it if the migration isn't applied.
  const SUB_COLS = "id, test_key, answers, registration, corsista_id, created_at, lang";
  const primary = await svc
    .from("exam_submissions")
    .select(`${SUB_COLS}, partecipante_id`)
    .eq("corso_id", Number(courseId))
    .eq("mode", "exam")
    .neq("test_key", "feedback")
    .order("created_at", { ascending: false });
  let subs = primary.data as unknown[] | null;
  if (primary.error) {
    const fallback = await svc
      .from("exam_submissions")
      .select(SUB_COLS)
      .eq("corso_id", Number(courseId))
      .eq("mode", "exam")
      .neq("test_key", "feedback")
      .order("created_at", { ascending: false });
    subs = fallback.data as unknown[] | null;
  }
  if (!subs || subs.length === 0) return [];

  const qCache = new Map<string, PublicRunnerQuestion[]>();
  const getQuestions = async (tk: string): Promise<PublicRunnerQuestion[]> => {
    if (!qCache.has(tk)) {
      const d = await loadPublicExam(courseId, family, tk as ExamTestKey, true);
      qCache.set(tk, d?.questions ?? []);
    }
    return qCache.get(tk)!;
  };

  type CorsistaRow = { id: number; full_name: string | null; email: string | null };
  type EnrollmentRow = {
    id: number;
    exam_result: string | null;
    exam_score_pct: number | null;
    /** Confirmed-email snapshot (course-start /conferma) — preferred over
     *  corsisti.email, same rule as the roster and the exam-invite sender. */
    enrolled_email?: string | null;
  };

  // BATCH (avoid N+1): collect all corsista_ids across submissions, then fetch
  // the corsisti rows and this course's enrollments once, keyed by corsista_id.
  const corsistaIds = Array.from(
    new Set(
      (subs as Array<{ corsista_id: number | null }>)
        .map((s) => s.corsista_id)
        .filter((id): id is number => id != null),
    ),
  );

  // BATCH the companion identities too (no per-row N+1): distinct
  // partecipante_ids → one corsi_partecipanti fetch (name, email, outcome).
  type PartecipanteRow = {
    id: number;
    full_name: string | null;
    email: string | null;
    exam_result: string | null;
    exam_score_pct: number | null;
  };
  const partecipanteIds = Array.from(
    new Set(
      (subs as Array<{ partecipante_id?: number | null }>)
        .map((s) => s.partecipante_id ?? null)
        .filter((id): id is number => id != null),
    ),
  );
  const partecipantiById = new Map<number, PartecipanteRow>();
  if (partecipanteIds.length > 0) {
    // Outcome columns may predate the migration — retry with the base columns
    // so identities still resolve (result then shows as unconfirmed).
    const withOutcome = await svc
      .from("corsi_partecipanti")
      .select("id, full_name, email, exam_result, exam_score_pct")
      .in("id", partecipanteIds);
    let pRows = withOutcome.data as PartecipanteRow[] | null;
    if (withOutcome.error) {
      const base = await svc
        .from("corsi_partecipanti")
        .select("id, full_name, email")
        .in("id", partecipanteIds);
      pRows = ((base.data ?? []) as Array<Omit<PartecipanteRow, "exam_result" | "exam_score_pct">>).map(
        (r) => ({ ...r, exam_result: null, exam_score_pct: null }),
      );
    }
    for (const r of pRows ?? []) partecipantiById.set(r.id, r);
  }

  const corsistiById = new Map<number, CorsistaRow>();
  const enrollmentByCorsistaId = new Map<number, EnrollmentRow>();
  if (corsistaIds.length > 0) {
    const [{ data: corRows }, enrResult] = await Promise.all([
      svc.from("corsisti").select("id, full_name, email").in("id", corsistaIds),
      svc
        .from("corsi_iscrizioni")
        .select("id, corsista_id, exam_result, exam_score_pct, enrolled_email")
        .eq("corso_id", Number(courseId))
        .in("corsista_id", corsistaIds),
    ]);
    // Pre-migration degrade: retry without enrolled_email so identities still
    // resolve (just via corsisti.email, same as before this column existed).
    let enrRows: Array<EnrollmentRow & { corsista_id: number }> | null = enrResult.data as
      | Array<EnrollmentRow & { corsista_id: number }>
      | null;
    if (enrResult.error) {
      const base = await svc
        .from("corsi_iscrizioni")
        .select("id, corsista_id, exam_result, exam_score_pct")
        .eq("corso_id", Number(courseId))
        .in("corsista_id", corsistaIds);
      enrRows = base.data as Array<EnrollmentRow & { corsista_id: number }> | null;
    }
    for (const r of (corRows ?? []) as CorsistaRow[]) corsistiById.set(r.id, r);
    for (const r of enrRows ?? []) {
      enrollmentByCorsistaId.set(r.corsista_id, {
        id: r.id,
        exam_result: r.exam_result,
        exam_score_pct: r.exam_score_pct,
        enrolled_email: r.enrolled_email,
      });
    }
  }

  const out: GradedSubmission[] = [];
  for (const s of subs as Array<{
    id: number;
    test_key: string;
    answers: Record<string, string | string[]> | null;
    registration: Record<string, string> | null;
    corsista_id: number | null;
    partecipante_id?: number | null;
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
    const { detail: pureDetail, gradable, manual, autoScore, suggested } = gradeAnswers(questions, ans, s.lang ?? undefined);

    // Attach each question's category (KB-section key) so the results UI can
    // scope AI grading of open answers to the right knowledge-base chapter.
    const catByQid = new Map<string, string>();
    for (const q of questions) if (q.cat) catByQid.set(q.id, q.cat);
    const detail: GradedAnswer[] = pureDetail.map((d) => {
      const cat = catByQid.get(d.qid);
      return cat ? { ...d, cat } : d;
    });

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

    // COMPANION: a personal link bound to a "doppio" companion carries
    // partecipante_id — identity and outcome live on corsi_partecipanti (the
    // enrollment belongs to the main corsista and is NEVER used for companions).
    const partecipanteId = s.partecipante_id ?? null;
    if (partecipanteId != null) {
      const part = partecipantiById.get(partecipanteId) ?? null;
      if (part) {
        // AUTHORITATIVE, same rule as corsisti: the verified subject's own
        // name/email win over anything typed into registration fields.
        if (part.full_name) name = part.full_name;
        if (part.email) email = part.email.toLowerCase().trim();
        currentResult = part.exam_result;
        currentScore = part.exam_score_pct;
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
        enrollmentId: null,
        corsistaId: null,
        partecipanteId,
        currentResult,
        currentScore,
        lang: s.lang ?? null,
        answers: detail,
      });
      continue;
    }

    // PRIMARY: proctored submissions carry corsista_id → resolve the student and
    // enrollment directly. This is the reliable tie-back even when the exam
    // collected no registration fields (name/email would otherwise be "—").
    if (s.corsista_id != null) {
      const cor = corsistiById.get(s.corsista_id) ?? null;
      const enrollment = enrollmentByCorsistaId.get(s.corsista_id) ?? null;
      if (cor) {
        // AUTHORITATIVE: a proctored submission is tied to the verified enrolled
        // student, so their identity wins over anything in registration — never
        // show (or route a certificate to) a student-typed value. The confirmed
        // enrolled_email snapshot (course-start /conferma) is the CURRENT address
        // and takes priority over corsisti.email (the Shopify identity, which can
        // drift — this is the same divergence the owner spotted between the
        // educator page and this results view); corsisti.email is the fallback
        // for a student who never confirmed.
        const c = cor as { full_name: string | null; email: string | null };
        if (c.full_name) name = c.full_name;
        const resolvedEmail = (enrollment?.enrolled_email ?? "").trim() || (c.email ?? "");
        if (resolvedEmail) email = resolvedEmail.toLowerCase().trim();
      }
      applyEnrollment(enrollment);
    }

    // FALLBACK: legacy / non-proctored submissions only have an email → match it
    // case-insensitively (the stored corsista email may be mixed-case, while the
    // submission email was lowercased above — `.eq` would miss those rows). This
    // path is rare (only rows with no corsista_id), so it stays per-row; the
    // enrollment lookup still reuses the pre-fetched course-enrollment Map.
    if (enrollmentId == null && email) {
      const { data: c } = await svc.from("corsisti").select("id").ilike("email", email).maybeSingle();
      if (c) {
        const cid = (c as { id: number }).id;
        let e = enrollmentByCorsistaId.get(cid) ?? null;
        if (!e) {
          const { data: eRow } = await svc
            .from("corsi_iscrizioni")
            .select("id, exam_result, exam_score_pct")
            .eq("corsista_id", cid)
            .eq("corso_id", Number(courseId))
            .maybeSingle();
          e = (eRow as EnrollmentRow | null) ?? null;
        }
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
      corsistaId: s.corsista_id ?? null,
      partecipanteId: null,
      currentResult,
      currentScore,
      lang: s.lang ?? null,
      answers: detail,
    });
  }
  return out;
}
