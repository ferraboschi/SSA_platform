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
import { verifyExamToken } from "./token";

const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_REPORT = 30; // ~1 report every 2s max per link

export interface ProgressInput {
  currentIdx: number;
  total: number;
  elapsed: number;
}

export async function reportExamProgressAction(
  token: string,
  input: ProgressInput,
): Promise<{ ok: boolean }> {
  const res = verifyExamToken(token);
  if (!res.ok) return { ok: false };
  const { c, t, m, s, p } = res.payload;
  if (m !== "exam") return { ok: true }; // previews report nothing
  if (limiter.isLimited("progress", token, RATE_LIMIT_REPORT)) return { ok: true };

  const corsoId = /^\d+$/.test(c) ? Number(c) : null;
  const corsistaId = s && /^\d+$/.test(s) ? Number(s) : null;
  const partecipanteId = p && /^\d+$/.test(p) ? Number(p) : null;
  if (corsoId == null || (corsistaId == null && partecipanteId == null)) return { ok: false };

  const currentIdx = Math.max(0, Math.trunc(Number(input.currentIdx) || 0));
  const total = Math.max(0, Math.trunc(Number(input.total) || 0));
  const elapsed = Math.max(0, Math.trunc(Number(input.elapsed) || 0));

  const svc = getSupabaseServiceClient();
  const subjCol = corsistaId != null ? "corsista_id" : "partecipante_id";
  const subjId = corsistaId ?? partecipanteId!;

  // Manual upsert (the unique indexes are PARTIAL, which PostgREST's
  // on_conflict can't target): update-first, insert when no row yet. A rare
  // concurrent double-insert bounces off the unique index and is ignored.
  const { data: upd, error: updErr } = await svc
    .from("exam_progress")
    .update({ current_idx: currentIdx, total, elapsed_seconds: elapsed, updated_at: new Date().toISOString() })
    .eq("corso_id", corsoId)
    .eq("test_key", t)
    .eq(subjCol, subjId)
    .is("submitted_at", null)
    .select("id");
  if (updErr) return { ok: true }; // table missing pre-migration → silent no-op
  if ((upd ?? []).length === 0) {
    await svc
      .from("exam_progress")
      .insert({ corso_id: corsoId, test_key: t, [subjCol]: subjId, current_idx: currentIdx, total, elapsed_seconds: elapsed })
      .select("id");
  }
  return { ok: true };
}
