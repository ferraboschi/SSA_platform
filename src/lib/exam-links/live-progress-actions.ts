"use server";

// STAFF (session-gated) live exam progress — the internal mirror of what the
// educator sees on their /condividi "Esami" tab. Any signed-in staff member
// may watch it (matches the exam library editor's "open to everyone signed
// in" policy); a guest/unauthenticated caller is refused. The owner's rule:
// staff can OBSERVE the run, but the outcome is confirmed in the Esiti tab
// (grading-actions.ts), never decided by the educator.
import { getSession } from "@/lib/auth/session";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { VALID_TEST, loadExamProgress, type SubjectProgress } from "./live-progress";

const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_READ = 30;

export interface LiveRosterEntry {
  id: number;
  kind: "corsista" | "partecipante";
  name: string;
}

/** Minimal roster (id/kind/name only — no email/phone/purchase data needed
 *  here) so the live view can label each progress row by name. */
async function loadRoster(corsoId: number): Promise<LiveRosterEntry[]> {
  const svc = getSupabaseServiceClient();
  const out: LiveRosterEntry[] = [];
  const { data: iscr } = await svc
    .from("corsi_iscrizioni")
    .select("corsista:corsisti(id, full_name)")
    .eq("corso_id", corsoId);
  for (const r of (iscr ?? []) as unknown as { corsista: { id: number; full_name: string | null } | null }[]) {
    if (r.corsista) out.push({ id: r.corsista.id, kind: "corsista", name: r.corsista.full_name ?? "" });
  }
  const { data: part } = await svc
    .from("corsi_partecipanti")
    .select("id, full_name")
    .eq("corso_id", corsoId);
  for (const p of (part ?? []) as { id: number; full_name: string | null }[]) {
    out.push({ id: p.id, kind: "partecipante", name: p.full_name ?? "" });
  }
  return out;
}

export async function getExamProgressForStaffAction(
  corsoId: string,
  testKey: string,
): Promise<{
  ok: boolean;
  progress?: Record<string, SubjectProgress>;
  sends?: Record<string, string>;
  presentForTest?: Record<string, boolean>;
  roster?: LiveRosterEntry[];
  error?: string;
}> {
  const session = await getSession();
  if (!session || session.user.roleKey === "guest") return { ok: false, error: "Non autorizzato." };

  const id = Number(corsoId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Corso non valido." };
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };
  if (limiter.isLimited("progress", `${session.user.email || "staff"}:${id}`, RATE_LIMIT_READ)) {
    return { ok: true, progress: undefined };
  }

  const [result, roster] = await Promise.all([loadExamProgress(id, t), loadRoster(id)]);
  return { ok: true, ...result, roster };
}
