import "server-only";

// Finalize in-progress sittings when an educator closes a test (owner call-debug
// batch). Closing a test only wrote a `settings_kv` closure row — it never
// finalized students who were mid-exam, so their sitting stayed "esame in corso"
// forever (the live bar never flips to Consegnato) and never reached the Esiti
// table (built only from exam_submissions). This hands each in-progress sitting
// in with the answers the SERVER last saw (the live-progress snapshot), exactly
// like submitExam, so the educator sees them as consegnato with a score.

import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { runSingleSubmissionCorrection } from "@/lib/esami/correction-run";
import { after } from "next/server";

type DbErr = { code?: string; message: string } | null;
/** True only for a genuinely MISSING COLUMN (pre-migration), never an FK error. */
function isMissingColumn(e: DbErr, col: string): boolean {
  if (!e || !e.message.includes(col)) return false;
  if (e.code === "PGRST204" || e.code === "42703") return true;
  return /column|schema cache|does not exist/i.test(e.message);
}

interface ProgressRow {
  corsista_id: number | null;
  partecipante_id: number | null;
  answers: (Record<string, string | string[]> & { __lang?: string }) | null;
  elapsed_seconds: number | null;
}

/**
 * For a just-closed (course, test): auto-submit every still-open sitting with its
 * last server-persisted answers, stamp its progress row done, and grade it in the
 * background — mirroring submitExam. Call this AFTER setClosure so no heartbeat
 * can resurrect a stamped row (the heartbeat's own closure check now rejects it).
 * Best-effort and idempotent: the exam_submissions unique index guarantees a
 * genuine hand-in is never overwritten (23505 swallowed), and empty sittings
 * (parked on the language/registration screen, no graded answers) are SKIPPED so
 * a no-show is never branded 0/100.
 */
export async function finalizeInProgressOnClose(corsoId: number, testKey: string): Promise<void> {
  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from("exam_progress")
    .select("corsista_id, partecipante_id, answers, elapsed_seconds")
    .eq("corso_id", corsoId)
    .eq("test_key", testKey)
    .is("submitted_at", null);
  if (error || !data || data.length === 0) return;

  // Family for the background grading (same mapping as submitExam).
  const { data: corso } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
  const family = (corso as { type?: string } | null)?.type === "shochu" ? "shochu" : "nihonshu";
  const nowIso = new Date().toISOString();

  for (const r of data as ProgressRow[]) {
    const corsistaId = r.corsista_id ?? null;
    const partecipanteId = r.partecipante_id ?? null;
    if (corsistaId == null && partecipanteId == null) continue;

    // Split registration ("reg:<field>") from graded answers + strip __lang,
    // mirroring submitExam and the page-resume snapshot.
    const raw = r.answers ?? {};
    const { __lang, ...rest } = raw;
    const registration: Record<string, string> = {};
    const answers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k.startsWith("reg:")) registration[k.slice(4)] = Array.isArray(v) ? v.join(", ") : String(v);
      else answers[k] = v;
    }
    // SKIP empty sittings — a student who only reached the language/reg screen has
    // no graded answers; finalizing would brand a no-show 0/100.
    if (Object.keys(answers).length === 0) continue;

    const subjCol = corsistaId != null ? "corsista_id" : "partecipante_id";
    const subjId = (corsistaId ?? partecipanteId)!;
    const base = {
      corso_id: corsoId,
      course_ref: String(corsoId),
      test_key: testKey,
      mode: "exam",
      lang: typeof __lang === "string" ? __lang : null,
      elapsed_seconds: r.elapsed_seconds ?? null,
      answers,
      registration: Object.keys(registration).length ? registration : null,
    };

    let submissionId: number | null = null;
    let { data: ins, error: insErr } = await svc
      .from("exam_submissions")
      .insert({ ...base, [subjCol]: subjId })
      .select("id");
    submissionId = (ins?.[0]?.id as number | undefined) ?? null;
    // Pre-migration: the partecipante_id column may not exist yet → keep the row
    // identity-less rather than lose it (matches submitExam's degrade).
    if (insErr && subjCol === "partecipante_id" && isMissingColumn(insErr, "partecipante_id")) {
      ({ data: ins, error: insErr } = await svc.from("exam_submissions").insert(base).select("id"));
      submissionId = (ins?.[0]?.id as number | undefined) ?? submissionId;
    }
    if (insErr) {
      // A genuine hand-in already exists (unique index) → do NOT overwrite it, but
      // still stamp the progress row done below. Any other error → skip this row
      // (worst case it stays "in corso", i.e. no worse than before this fix).
      if (!/duplicate key|unique|23505/i.test(insErr.message)) continue;
    }

    await svc
      .from("exam_progress")
      .update({ submitted_at: nowIso, updated_at: nowIso })
      .eq("corso_id", corsoId)
      .eq("test_key", testKey)
      .eq(subjCol, subjId)
      .is("submitted_at", null)
      .then(() => {}, () => {});

    if (submissionId != null) {
      const subId = submissionId;
      after(() => runSingleSubmissionCorrection(String(corsoId), family, testKey, subId).catch(() => false));
    }
  }
}
