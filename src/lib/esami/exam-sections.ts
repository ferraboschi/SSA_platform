// Pure per-category exam analytics — no DB, no server/client deps, fully
// unit-testable. Shared by the day-test esito (buildDayEsito) and the exam
// certificate so both bucket scores IDENTICALLY (owner batch 16: "suddividi le
// varie sezioni — storia, produzione — e la % ben svolta per ciascuna").

import { EXAM_THRESHOLDS } from "@/lib/domain/constants";

/** Pass threshold as a whole percentage (80). Single source with the grader's
 *  EXAM_THRESHOLDS.pass — a bar/area at or above this is "verde". */
export const PASS_PCT = Math.round(EXAM_THRESHOLDS.pass * 100);

/** One graded answer, reduced to what the section maths needs. `ok === null`
 *  means the objective grader could not settle it (open/match/keyless) → its
 *  points come from the AI open-grade lane instead. */
export interface SectionDetail {
  qid: string;
  ok: boolean | null;
  /** Earned share 0..1 for auto-graded answers (MULTI partial credit). */
  fraction?: number;
}

/** Per-question weight + the category bucket it falls under. The caller resolves
 *  the fallback bucket (e.g. "Generale") before calling — an empty label here is
 *  simply its own bucket. */
export interface SectionQMeta {
  points: number;
  cat: string;
}

/** AI points for one open answer (from the correction draft). */
export interface SectionOpenGrade {
  points: number;
  failed: boolean;
}

export interface ExamSection {
  name: string;
  /** Rounded 0..100 — earned points over gradeable points in this bucket. */
  pct: number;
}

/** Bucket every SETTLED answer's score by category. An objective answer earns
 *  `fraction × points`; an open answer earns its clamped AI points; anything
 *  still unsettled (open with no/failed AI grade) is dropped entirely — it
 *  neither earns nor inflates the bucket's max, so a pending answer never
 *  deflates a section. Mirrors the day-esito algorithm exactly. */
export function computeSections(
  detail: SectionDetail[],
  qMeta: Map<string, SectionQMeta>,
  openByQid: Map<string, SectionOpenGrade>,
): ExamSection[] {
  const secMap = new Map<string, { earned: number; max: number }>();
  for (const d of detail) {
    const meta = qMeta.get(d.qid);
    if (!meta) continue;
    let earned: number | null = null;
    if (d.ok !== null) {
      earned = (d.ok ? 1 : Math.max(0, Math.min(1, d.fraction ?? 0))) * meta.points;
    } else {
      const g = openByQid.get(d.qid);
      if (g && !g.failed) earned = Math.max(0, Math.min(meta.points, g.points));
    }
    if (earned == null) continue;
    const s = secMap.get(meta.cat) ?? { earned: 0, max: 0 };
    s.earned += earned;
    s.max += meta.points;
    secMap.set(meta.cat, s);
  }
  return [...secMap.entries()]
    .filter(([, s]) => s.max > 0)
    .map(([name, s]) => ({ name, pct: Math.round((100 * s.earned) / s.max) }));
}

/** Which lead sentence the certificate's "Aree da consolidare" block should use,
 *  plus the areas to name (weakest first, capped). Pure — the copy itself lives
 *  in the report i18n dictionary, keyed by the returned `leadKey`:
 *   • passed + every area ≥ soglia → `strong` (name only the single lowest, as a
 *     refinement nudge — nothing is actually weak);
 *   • otherwise → the verdict's own lead, naming the areas below the soglia
 *     (or, defensively, the single lowest if none are below).
 *  Returns null when there are no areas to reason about. */
export function weakAreas(
  sections: ExamSection[],
  status: "passed" | "retrial" | "failed",
  max = 3,
): { leadKey: "passed" | "retrial" | "failed" | "strong"; items: ExamSection[] } | null {
  if (sections.length === 0) return null;
  const byLowest = [...sections].sort((a, b) => a.pct - b.pct);
  const weak = byLowest.filter((s) => s.pct < PASS_PCT);
  if (status === "passed" && weak.length === 0) {
    return { leadKey: "strong", items: [byLowest[0]] };
  }
  const items = (weak.length > 0 ? weak : byLowest.slice(0, 1)).slice(0, max);
  return { leadKey: status, items };
}
