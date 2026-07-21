import "server-only";

// Cohort average for the exam certificate (owner batch 16: "fornisci una media,
// il confronto delle mie risposte rispetto alla media"). This is the one figure
// the platform did not already compute, so it lives here as a shared, cached
// aggregation (same pattern as getShellData): it is identical for every student
// and changes only when a new result is confirmed.
//
// Honesty rule (owner decision): a certificate prints the media ONLY when the
// family has enough confirmed final results to be meaningful — below the sample
// floor the certificate falls back to the fixed 80% pass threshold alone,
// instead of a noisy average over one or two sittings.

import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import type { ExamFamily } from "@/lib/domain";

/** Revalidate this after any result confirmation so the cached average refreshes. */
export const CLASS_AVG_TAG = "exam-class-average";

/** Minimum confirmed final scores in a family before its average is printed on a
 *  certificate. Under this, the cert shows only the 80% threshold. */
export const CLASS_AVG_MIN_SAMPLE = 8;

/** nihonshu = "certificato" courses, shochu = "shochu" courses. */
const COURSE_TYPE: Record<ExamFamily, string> = { nihonshu: "certificato", shochu: "shochu" };

async function computeFamilyAverage(family: ExamFamily): Promise<{ avg: number; n: number }> {
  const svc = getSupabaseServiceClient();

  // Course ids of this family, then the confirmed final scores across them
  // (enrolled corsisti + "doppio" companions). A confirmed result is exactly a
  // non-null exam_score_pct — the same value the certificate prints as `score`.
  const { data: corsi, error: corsiErr } = await svc
    .from("corsi")
    .select("id")
    .eq("type", COURSE_TYPE[family]);
  // THROW (don't return zeros) on a total failure: this runs inside
  // unstable_cache, which stores returned values but NOT thrown errors — so a
  // returned {n:0} would poison the cohort media on every certificate for 30
  // min after one cold-cache DB hiccup. Throwing lets getClassAverage's catch
  // fail-open to null without caching the miss (same rule as catalog.ts).
  if (corsiErr) throw new Error(`class-average: corsi query failed: ${corsiErr.message}`);
  const ids = (corsi ?? []).map((c) => (c as { id: number }).id);
  if (ids.length === 0) return { avg: 0, n: 0 };

  const [iscr, part] = await Promise.all([
    svc
      .from("corsi_iscrizioni")
      .select("exam_score_pct")
      .in("corso_id", ids)
      .not("exam_score_pct", "is", null),
    // Companion outcomes may predate the exam_score_pct column — tolerate the
    // error (the enrolled corsisti alone still give a sound average).
    svc
      .from("corsi_partecipanti")
      .select("exam_score_pct")
      .in("corso_id", ids)
      .not("exam_score_pct", "is", null),
  ]);

  const scores: number[] = [];
  for (const r of [...(iscr.data ?? []), ...(part.error ? [] : part.data ?? [])]) {
    const v = (r as { exam_score_pct: number | null }).exam_score_pct;
    if (typeof v === "number" && Number.isFinite(v)) scores.push(v);
  }
  if (scores.length === 0) return { avg: 0, n: 0 };
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { avg, n: scores.length };
}

/** The family's certificate media, or null when there aren't enough confirmed
 *  results yet (→ the certificate shows only the 80% threshold). Fail-open to
 *  null so a query hiccup never blocks a certificate. The `family` rides into
 *  the cache key so each family memoizes independently; 30-min backstop covers a
 *  missed tag revalidation (an advisory number tolerates mild staleness). */
export async function getClassAverage(family: ExamFamily): Promise<number | null> {
  const cached = unstable_cache(
    () => computeFamilyAverage(family),
    ["exam-class-average-v1", family],
    { revalidate: 1800, tags: [CLASS_AVG_TAG] },
  );
  try {
    const { avg, n } = await cached();
    return n >= CLASS_AVG_MIN_SAMPLE ? avg : null;
  } catch {
    return null;
  }
}

/** Call after confirming a result so the next certificate reflects it. Safe to
 *  call outside a request scope (no-op if revalidation isn't available). */
export function revalidateClassAverage(): void {
  try {
    revalidateTag(CLASS_AVG_TAG, "max");
  } catch {
    /* not in a request context — the 30-min backstop covers it */
  }
}
