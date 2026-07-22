"use server";

// LIVE EXAM PROGRESS. Server-only writes, token-verified.
//
// While a student takes a test from their personal link, the runner reports
// lightweight progress (question index / total / elapsed) so the educator can
// watch a live progress bar per student. Identity comes from the VERIFIED exam
// token (`s` corsista / `p` companion), never from the client. Rows land in
// exam_progress (RLS-locked, one row per subject+test — see migration
// 20260703120000). Graceful: a missing table degrades to no-op.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { getClosure, isBlockedByClosure } from "./lifecycle";
import { verifyExamToken } from "./token";
import { resolveSubjectIds, hasSubject, subjectColId } from "./access";

const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_REPORT = 30; // ~1 report every 2s max per link

export interface ProgressInput {
  currentIdx: number;
  total: number;
  elapsed: number;
  /** Current answers snapshot — graded on READ for the live corrette/sbagliate
   *  counts in the educator's expanded row. */
  answers?: Record<string, string[] | string>;
}

export async function reportExamProgressAction(
  token: string,
  input: ProgressInput,
): Promise<{ ok: boolean }> {
  const res = verifyExamToken(token);
  if (!res.ok) return { ok: false };
  const { t, m } = res.payload;
  if (m !== "exam") return { ok: true }; // previews report nothing
  if (limiter.isLimited("progress", token, RATE_LIMIT_REPORT)) return { ok: true };

  const { corsoId, corsistaId, partecipanteId } = resolveSubjectIds(res.payload);
  if (corsoId == null || !hasSubject({ corsistaId, partecipanteId })) return { ok: false };

  // A closure — or the sandbox-reset epoch — kills outstanding links: their
  // heartbeats must not resurrect freshly wiped progress rows.
  const closedAt = await getClosure(corsoId, t);
  if (isBlockedByClosure(closedAt, res.payload.ia)) return { ok: false };

  const currentIdx = Math.max(0, Math.trunc(Number(input.currentIdx) || 0));
  const total = Math.max(0, Math.trunc(Number(input.total) || 0));
  const elapsed = Math.max(0, Math.trunc(Number(input.elapsed) || 0));
  // Answers snapshot, size-bounded (an exam is ~100 short answers — 32KB is
  // generous; anything bigger is dropped, the counts just lag a tick).
  let answers: Record<string, string[] | string> | null = null;
  try {
    if (input.answers && JSON.stringify(input.answers).length <= 32_000) {
      answers = input.answers;
    }
  } catch {
    answers = null;
  }

  const svc = getSupabaseServiceClient();
  // hasSubject was asserted above → subjectColId is non-null here.
  const { col: subjCol, id: subjId } = subjectColId({ corsistaId, partecipanteId })!;

  // Manual upsert (the unique indexes are PARTIAL, which PostgREST's
  // on_conflict can't target): update-first, insert when no row yet. A rare
  // concurrent double-insert bounces off the unique index and is ignored.
  // The answers column is newer than the table — retry without it (graceful).
  const patch: Record<string, unknown> = {
    current_idx: currentIdx,
    total,
    elapsed_seconds: elapsed,
    updated_at: new Date().toISOString(),
  };
  if (answers) patch.answers = answers;
  const doUpdate = (p: Record<string, unknown>) =>
    svc
      .from("exam_progress")
      .update(p)
      .eq("corso_id", corsoId)
      .eq("test_key", t)
      .eq(subjCol, subjId)
      .is("submitted_at", null)
      .select("id");
  let { data: upd, error: updErr } = await doUpdate(patch);
  if (updErr && answers && /answers|column/i.test(updErr.message)) {
    delete patch.answers;
    ({ data: upd, error: updErr } = await doUpdate(patch));
  }
  if (updErr) return { ok: true }; // table missing pre-migration → silent no-op
  if ((upd ?? []).length === 0) {
    const row: Record<string, unknown> = {
      corso_id: corsoId,
      test_key: t,
      [subjCol]: subjId,
      current_idx: currentIdx,
      total,
      elapsed_seconds: elapsed,
    };
    if (answers) row.answers = answers;
    let ins = await svc.from("exam_progress").insert(row).select("id");
    if (ins.error && answers && /answers|column/i.test(ins.error.message)) {
      delete row.answers;
      ins = await svc.from("exam_progress").insert(row).select("id");
    }
  }
  return { ok: true };
}
