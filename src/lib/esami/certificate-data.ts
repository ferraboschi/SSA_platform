import "server-only";

// Server-side enrichment for the exam certificate (owner batch 16): the
// per-area breakdown a certificate shows next to the headline score. It reuses
// the SAME bucketing engine as the day-test esito (computeSections), so a
// student's certificate and their in-app result never disagree.

import { loadPublicExam } from "@/lib/exam-links/load";
import { computeSections, type ExamSection } from "./exam-sections";
import type { GradedSubmission } from "@/lib/exam-links/results";
import type { ExamFamily } from "@/lib/domain";

/** Same enrolled subject as the confirmed result — enrollment id (corsista) or
 *  partecipante id (companion) is authoritative; email is the legacy fallback. */
function sameSubject(s: GradedSubmission, c: GradedSubmission): boolean {
  if (c.enrollmentId != null) return s.enrollmentId === c.enrollmentId;
  if (c.partecipanteId != null) return s.partecipanteId === c.partecipanteId;
  return !!c.studentEmail && s.studentEmail.toLowerCase() === c.studentEmail.toLowerCase();
}

/** The subject's FINAL-exam submission. The confirmed outcome lives on the
 *  enrollment, so findConfirmedResultByEmail can hand back ANY of the subject's
 *  submissions (a day test included); the certificate breakdown must come from
 *  the final exam specifically. subs are newest-first, so `.find` takes the most
 *  recent final if legacy duplicates exist. */
function resolveFinalSubmission(
  subs: GradedSubmission[],
  confirmed: GradedSubmission,
): GradedSubmission | null {
  if (confirmed.testKey === "final") return confirmed;
  return subs.find((s) => s.testKey === "final" && sameSubject(s, confirmed)) ?? null;
}

/** Per-area score bars for a FINAL-exam certificate, on the SAME objective basis
 *  as the certificate's headline score. The confirmed headline (certifiedScore →
 *  exam_score_pct) is the objective auto-score and never folds in AI open-answer
 *  points, so the areas mustn't either — otherwise a mostly-open area could read
 *  90% under a "Non promosso 68%" headline. Open answers (ok===null) therefore
 *  drop out of every bucket (they aren't in the objective denominator), exactly
 *  as they drop out of the headline. Returns [] unless there are ≥2 distinct
 *  areas: a single bucket only restates the headline, so it isn't worth drawing. */
export async function buildCertificateSections(
  courseId: string,
  family: ExamFamily,
  subs: GradedSubmission[],
  confirmed: GradedSubmission,
): Promise<ExamSection[]> {
  const finalSub = resolveFinalSubmission(subs, confirmed);
  if (!finalSub) return [];
  const data = await loadPublicExam(courseId, family, "final", true).catch(() => null);
  if (!data || data.questions.length === 0) return [];

  const qMeta = new Map(
    data.questions.map((q) => [
      q.id,
      { points: q.points ?? 1, cat: (q.cat ?? "").trim() || "Generale" },
    ]),
  );

  // Objective only: no AI open-grade lane (empty map), so ok===null answers are
  // excluded from every area — in lock-step with the objective headline score.
  const sections = computeSections(finalSub.answers, qMeta, new Map());
  return sections.length >= 2 ? sections : [];
}
