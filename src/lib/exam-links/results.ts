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
  /** The seat this hand-in resolved to was REMOVED from the course
   *  (`corsi_iscrizioni.annullata_at`: refund / credit / transfer). The row stays
   *  listed for audit but is never confirmable, sent, exported or counted. */
  annullata: boolean;
  /** The bound corsista (proctored submissions) — keys the attendance map.
   *  Always the SURVIVING record when the submission's corsista was merged. */
  corsistaId: number | null;
  /** Set (and enrollmentId null) when the submission belongs to a "doppio"
   *  companion (corsi_partecipanti) instead of an enrolled corsista. */
  partecipanteId: number | null;
  currentResult: string | null;
  currentScore: number | null;
  /** Language the student took the exam in (for a localized result email/PDF). */
  lang: string | null;
  /** Raw registration fields typed in the exam (gender/nationality/dob/…) —
   *  feeds the SSA-London attendance export. */
  registration: Record<string, string> | null;
  answers: GradedAnswer[];
}

/** Find the CONFIRMED result for an email — deterministic when a companion
 *  shares the buyer's email (same household): the enrolled corsista's row wins
 *  over a companion's, then the most recent. A removed seat never counts (no
 *  certificate / result email for a cancelled enrollment). Pure (unit-tested). */
export function findConfirmedResultByEmail(
  subs: GradedSubmission[],
  email: string,
): GradedSubmission | null {
  const low = email.toLowerCase().trim();
  const matches = subs.filter(
    (s) => s.studentEmail.toLowerCase() === low && s.currentResult && !s.annullata,
  );
  if (matches.length === 0) return null;
  const corsista = matches.find((s) => s.enrollmentId != null);
  return corsista ?? matches[0];
}

/** The seat a hand-in binds to when a corsista holds SEVERAL enrollment rows in
 *  the same course (a cancelled seat plus a re-enrolment): the active one wins,
 *  whatever the row order; only when every seat is cancelled does the first
 *  cancelled row stand in — kept so the hand-in stays visible as "posto
 *  rimosso" instead of vanishing. Pure (unit-tested). */
export function preferActiveEnrollment<T extends { annullata_at?: string | null }>(
  rows: T[],
): T | null {
  return rows.find((r) => !r.annullata_at) ?? rows[0] ?? null;
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

  type CorsistaRow = {
    id: number;
    full_name: string | null;
    email: string | null;
    /** Set on a duplicate folded into another record (see mergeCorsistiCore). */
    merged_into: number | null;
  };
  type EnrollmentRow = {
    id: number;
    exam_result: string | null;
    exam_score_pct: number | null;
    /** Confirmed-email snapshot (course-start /conferma) — preferred over
     *  corsisti.email, same rule as the roster and the exam-invite sender. */
    enrolled_email?: string | null;
    /** Seat removed from the course — see GradedSubmission.annullata. */
    annullata_at?: string | null;
  };
  const ENR_COLS = "id, corsista_id, exam_result, exam_score_pct, enrolled_email, annullata_at";
  const ENR_COLS_BASE = "id, corsista_id, exam_result, exam_score_pct";

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
  // MERGED DUPLICATES: a hand-in can still carry a folded record's id (submitted
  // before the merge, or a conflicting row left on the merged record), whose
  // enrollment now lives on the survivor. Follow `merged_into` to the surviving
  // record — a survivor can itself be merged later, so walk a few hops.
  const survivorOf = (id: number): number => {
    let cur = id;
    for (let hop = 0; hop < 3; hop++) {
      const next = corsistiById.get(cur)?.merged_into;
      if (next == null || next === cur) break;
      cur = next;
    }
    return cur;
  };
  if (corsistaIds.length > 0) {
    let pending = corsistaIds;
    for (let hop = 0; hop < 3 && pending.length > 0; hop++) {
      const { data } = await svc
        .from("corsisti")
        .select("id, full_name, email, merged_into")
        .in("id", pending);
      const rows = (data ?? []) as CorsistaRow[];
      for (const r of rows) corsistiById.set(r.id, r);
      pending = Array.from(
        new Set(
          rows
            .map((r) => r.merged_into)
            .filter((id): id is number => id != null && !corsistiById.has(id)),
        ),
      );
    }
    const lookupIds = Array.from(new Set([...corsistaIds, ...corsistiById.keys()]));
    const enrResult = await svc
      .from("corsi_iscrizioni")
      .select(ENR_COLS)
      .eq("corso_id", Number(courseId))
      .in("corsista_id", lookupIds);
    // Pre-migration degrade: retry without enrolled_email/annullata_at so
    // identities still resolve (via corsisti.email, no seat ever "removed").
    let enrRows: Array<EnrollmentRow & { corsista_id: number }> | null = enrResult.data as
      | Array<EnrollmentRow & { corsista_id: number }>
      | null;
    if (enrResult.error) {
      const base = await svc
        .from("corsi_iscrizioni")
        .select(ENR_COLS_BASE)
        .eq("corso_id", Number(courseId))
        .in("corsista_id", lookupIds);
      enrRows = base.data as Array<EnrollmentRow & { corsista_id: number }> | null;
    }
    for (const r of enrRows ?? []) {
      const prev = enrollmentByCorsistaId.get(r.corsista_id);
      const pick = preferActiveEnrollment(prev ? [prev, r] : [r])!;
      enrollmentByCorsistaId.set(r.corsista_id, {
        id: pick.id,
        exam_result: pick.exam_result,
        exam_score_pct: pick.exam_score_pct,
        enrolled_email: pick.enrolled_email,
        annullata_at: pick.annullata_at,
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
    let annullata = false;
    let currentResult: string | null = null;
    let currentScore: number | null = null;

    const applyEnrollment = (e: EnrollmentRow | null) => {
      if (!e) return;
      enrollmentId = e.id;
      annullata = Boolean(e.annullata_at);
      currentResult = e.exam_result;
      currentScore = e.exam_score_pct;
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
        annullata: false,
        corsistaId: null,
        partecipanteId,
        currentResult,
        currentScore,
        lang: s.lang ?? null,
        registration: (s.registration as Record<string, string> | null) ?? null,
        answers: detail,
      });
      continue;
    }

    // PRIMARY: proctored submissions carry corsista_id → resolve the student and
    // enrollment directly. This is the reliable tie-back even when the exam
    // collected no registration fields (name/email would otherwise be "—").
    // A merged duplicate resolves to its SURVIVOR: identity and attendance live
    // there now, and the enrollment is looked up under the submission's own id
    // first (a conflict row left on the merged record), then the survivor's.
    const subjectId = s.corsista_id != null ? survivorOf(s.corsista_id) : null;
    if (s.corsista_id != null && subjectId != null) {
      const cor = corsistiById.get(subjectId) ?? corsistiById.get(s.corsista_id) ?? null;
      const enrollment =
        enrollmentByCorsistaId.get(s.corsista_id) ?? enrollmentByCorsistaId.get(subjectId) ?? null;
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
      const { data: c } = await svc
        .from("corsisti")
        .select("id, merged_into")
        .ilike("email", email)
        .maybeSingle();
      if (c) {
        const { id: cid, merged_into } = c as { id: number; merged_into: number | null };
        // Same order as the proctored path: own id first, then the survivor.
        const ids = merged_into != null && merged_into !== cid ? [cid, merged_into] : [cid];
        let e: EnrollmentRow | null = null;
        for (const id of ids) {
          e = enrollmentByCorsistaId.get(id) ?? null;
          if (e) break;
          const withSeat = await svc
            .from("corsi_iscrizioni")
            .select(ENR_COLS)
            .eq("corsista_id", id)
            .eq("corso_id", Number(courseId));
          const rows = withSeat.error
            ? (
                await svc
                  .from("corsi_iscrizioni")
                  .select(ENR_COLS_BASE)
                  .eq("corsista_id", id)
                  .eq("corso_id", Number(courseId))
              ).data
            : withSeat.data;
          e = preferActiveEnrollment((rows ?? []) as EnrollmentRow[]);
          if (e) break;
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
      annullata,
      corsistaId: subjectId,
      partecipanteId: null,
      currentResult,
      currentScore,
      lang: s.lang ?? null,
      registration: (s.registration as Record<string, string> | null) ?? null,
      answers: detail,
    });
  }
  return out;
}
