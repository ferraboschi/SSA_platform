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
import { correctionKey } from "@/lib/esami/correction-types";
import { subjectColId } from "./access";
import { after } from "next/server";

// The submissions THIS close auto-created are recorded here so a mistaken close
// can be undone precisely (`undoCloseFinalized`) — only these rows are removed,
// never a genuine hand-in. One settings_kv row per (course, test).
const FINALIZED_KEY_PREFIX = "exam_close_finalized:";
function finalizedKey(corsoId: number, testKey: string): string {
  return `${FINALIZED_KEY_PREFIX}${corsoId}:${testKey}`;
}
type FinalizedSubjCol = "corsista_id" | "partecipante_id";
interface FinalizedItem {
  id: number;
  subjCol: FinalizedSubjCol;
  subjId: number;
}
interface StoredFinalized {
  at?: string;
  items?: FinalizedItem[];
}

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
  // Rows THIS close actually created (never a swallowed duplicate) — recorded so
  // a mistaken close can be undone precisely.
  const finalized: FinalizedItem[] = [];

  for (const r of data as ProgressRow[]) {
    const subj = subjectColId({ corsistaId: r.corsista_id, partecipanteId: r.partecipante_id });
    if (!subj) continue;

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

    const { col: subjCol, id: subjId } = subj;
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
      finalized.push({ id: subId, subjCol: subjCol as FinalizedSubjCol, subjId });
      after(() => runSingleSubmissionCorrection(String(corsoId), family, testKey, subId).catch(() => false));
    }
  }

  // Record this close's auto-created submissions (only when it created any, so a
  // second close with nothing left in-progress can't wipe the first's undo set).
  if (finalized.length > 0) {
    await svc
      .from("settings_kv")
      .upsert(
        { key: finalizedKey(corsoId, testKey), value: { at: nowIso, items: finalized } },
        { onConflict: "key" },
      )
      .then(() => {}, () => {});
  }
}

/**
 * Undo the auto-finalizations of the most recent close for a (course, test):
 * delete exactly the submissions this module created (never a genuine hand-in),
 * clear their draft corrections, and un-stamp their progress so those students
 * resume from where they were. Used by "riapri e annulla consegne" for a close
 * made by mistake. Idempotent; returns how many submissions were undone.
 */
export async function undoCloseFinalized(
  corsoId: number,
  testKey: string,
): Promise<{ ok: boolean; count: number }> {
  const svc = getSupabaseServiceClient();
  const key = finalizedKey(corsoId, testKey);
  const { data, error } = await svc
    .from("settings_kv")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return { ok: false, count: 0 };
  const items = ((data?.value as StoredFinalized | null)?.items ?? []).filter(
    (it) => it && Number.isFinite(it.id) && Number.isFinite(it.subjId),
  );
  if (items.length === 0) {
    await svc.from("settings_kv").delete().eq("key", key).then(() => {}, () => {});
    return { ok: true, count: 0 };
  }

  const ids = items.map((it) => it.id);
  // Remove the auto-created submissions + any draft corrections keyed to them.
  await svc.from("exam_submissions").delete().in("id", ids).then(() => {}, () => {});
  await svc
    .from("settings_kv")
    .delete()
    .in("key", ids.map((id) => correctionKey(corsoId, id)))
    .then(() => {}, () => {});

  // Un-stamp progress so each student resumes exactly where the close caught them.
  const nowIso = new Date().toISOString();
  for (const it of items) {
    await svc
      .from("exam_progress")
      .update({ submitted_at: null, updated_at: nowIso })
      .eq("corso_id", corsoId)
      .eq("test_key", testKey)
      .eq(it.subjCol, it.subjId)
      .then(() => {}, () => {});
  }

  await svc.from("settings_kv").delete().eq("key", key).then(() => {}, () => {});
  return { ok: true, count: ids.length };
}
