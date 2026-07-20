import "server-only";

// Server-side enrichment for the exam "resoconto" (owner batch 16-18):
//  • the per-area breakdown shown next to the headline score, and
//  • the open-answer review page (batch 18): each open answer's justification —
//    where/what/why it fell short — with the missing pieces filled in from the
//    knowledge base, taken from the AI correction draft's rationale.
// Both reuse work the platform already does, so the resoconto never disagrees
// with the in-app result or the staff grading.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { loadPublicExam } from "@/lib/exam-links/load";
import { correctionKey, type CorrectionDraft } from "./correction-types";
import { computeSections, type ExamSection } from "./exam-sections";
import type { GradedSubmission } from "@/lib/exam-links/results";
import type { ExamFamily } from "@/lib/domain";

/** One open-answer justification for the review page. */
export interface OpenReviewItem {
  question: string;
  given: string;
  /** AI vote 1-5 (when present) + earned/max points, for the small badge. */
  vote?: number;
  points: number;
  maxPoints: number;
  /** The justification: what the answer got right, what's missing, and the KB
   *  integration — already synthesised (and trimmed) for the page. */
  rationale: string;
}

export interface CertificateData {
  sections: ExamSection[];
  openReview: OpenReviewItem[];
}

const EMPTY: CertificateData = { sections: [], openReview: [] };

/** Cap the open-answer review to what fits ONE page (page 2), so a resoconto
 *  never exceeds two pages per language (owner batch 18). The worst answers come
 *  first, so the cut only ever drops already-strong ones. Every field is
 *  length-bounded too: the open-question textarea has no maxLength, so an
 *  unbounded answer in an unbreakable block could otherwise blow past one page
 *  (or hang react-pdf). With bounded fields AND a bounded count, page 2 stays a
 *  single page — verified by the render smoke test. */
const MAX_OPEN_REVIEW = 4;
const QUESTION_MAX = 180;
const GIVEN_MAX = 220;
/** Keep each justification synthetic (owner: "sintetico e non troppo esteso"). */
const RATIONALE_MAX = 300;

/** Same enrolled subject as the confirmed result — enrollment id (corsista) or
 *  partecipante id (companion) is authoritative; email is the legacy fallback. */
function sameSubject(s: GradedSubmission, c: GradedSubmission): boolean {
  if (c.enrollmentId != null) return s.enrollmentId === c.enrollmentId;
  if (c.partecipanteId != null) return s.partecipanteId === c.partecipanteId;
  return !!c.studentEmail && s.studentEmail.toLowerCase() === c.studentEmail.toLowerCase();
}

/** The subject's FINAL-exam submission. The confirmed outcome lives on the
 *  enrollment, so findConfirmedResultByEmail can hand back ANY of the subject's
 *  submissions (a day test included); the resoconto must come from the final
 *  exam specifically. subs are newest-first, so `.find` takes the most recent
 *  final if legacy duplicates exist. */
function resolveFinalSubmission(
  subs: GradedSubmission[],
  confirmed: GradedSubmission,
): GradedSubmission | null {
  if (confirmed.testKey === "final") return confirmed;
  return subs.find((s) => s.testKey === "final" && sameSubject(s, confirmed)) ?? null;
}

/** Trim text to a max length, cutting on a word boundary when possible. Keeps
 *  every review field bounded so an over-long answer can't push page 2 past one
 *  page (react-pdf hangs on an unbreakable block taller than the page). */
function trimTo(s: string | undefined, max: number): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Sections + open-answer review for a FINAL-exam resoconto.
 *
 *  Sections are on the SAME objective basis as the headline score (certifiedScore
 *  → exam_score_pct is objective-only and never folds in AI open points, so the
 *  areas mustn't either — else a mostly-open area could read 90% under a "Non
 *  promosso 68%" headline). Open answers therefore drop out of every bucket.
 *
 *  The open review, by contrast, IS the AI open-grade lane: each answered open
 *  question, worst-first, with its justification (where/what/why + KB
 *  integration), capped to one page. Sections need ≥2 areas to be worth drawing;
 *  a single bucket only restates the headline. */
export async function buildCertificateData(
  courseId: string,
  family: ExamFamily,
  subs: GradedSubmission[],
  confirmed: GradedSubmission,
): Promise<CertificateData> {
  const finalSub = resolveFinalSubmission(subs, confirmed);
  if (!finalSub) return EMPTY;
  const data = await loadPublicExam(courseId, family, "final", true).catch(() => null);
  if (!data || data.questions.length === 0) return EMPTY;

  const qMeta = new Map(
    data.questions.map((q) => [
      q.id,
      { points: q.points ?? 1, cat: (q.cat ?? "").trim() || "Generale" },
    ]),
  );
  const sectionsRaw = computeSections(finalSub.answers, qMeta, new Map());
  const sections = sectionsRaw.length >= 2 ? sectionsRaw : [];

  // Open-answer review from the submit-time AI correction draft (settings_kv).
  // Best-effort: no draft → no review page (the resoconto stays a single page).
  let openReview: OpenReviewItem[] = [];
  try {
    const svc = getSupabaseServiceClient();
    const { data: row } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", correctionKey(Number(courseId), finalSub.id))
      .maybeSingle();
    const draft = (row?.value as CorrectionDraft | null) ?? null;
    openReview = (draft?.openGrades ?? [])
      // Answered, actually graded (a failed AI call has no justification to show).
      .filter((g) => !g.failed && g.given && g.given !== "—" && g.rationale?.trim())
      // Worst-first: the answers that most need explaining lead — and survive the cap.
      .sort((a, b) => {
        const ra = a.maxPoints > 0 ? a.points / a.maxPoints : 0;
        const rb = b.maxPoints > 0 ? b.points / b.maxPoints : 0;
        return ra - rb;
      })
      .slice(0, MAX_OPEN_REVIEW)
      .map((g) => ({
        question: trimTo(g.question, QUESTION_MAX),
        given: trimTo(g.given, GIVEN_MAX),
        ...(g.vote != null ? { vote: g.vote } : {}),
        points: g.points,
        maxPoints: g.maxPoints,
        rationale: trimTo(g.rationale, RATIONALE_MAX),
      }));
  } catch {
    /* no draft / pre-migration — the resoconto simply omits the review page */
  }

  return { sections, openReview };
}
