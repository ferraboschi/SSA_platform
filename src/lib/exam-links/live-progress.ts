// Live "who's doing the exam right now" progress — the CORE query/grading
// logic, shared by two callers with different auth postures:
//   • the PUBLIC share-token action (educator's Esami tab on /condividi),
//   • the INTERNAL session-gated staff action (course detail's Esiti tab).
// Neither caller's auth check belongs here — this module only answers "given
// a course + test I'm already allowed to see, what's happening right now".
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { getExamSends } from "./send-log";
import { loadPublicExam, type PublicRunnerQuestion } from "./load";
import { gradeAnswers } from "./grading";
import type { ExamTestKey } from "./token";
import { courseDayInfo } from "@/lib/share-links/attendance-db";

type Svc = ReturnType<typeof getSupabaseServiceClient>;

// Whitelist the test key (never trust a caller to name an arbitrary test).
export const VALID_TEST = /^(day[1-9]|feedback|final)$/;

// ── Presence gate (owner's rule): an absent student must never be invited to
// an exam test. "dayN" ties to THAT appello day specifically (Camilla absent
// day 1 → can't get the day-1 test); "final" ties to the EXAM-DAY appello
// (owner, batch 7: presence on the exam day is what matters — not the other
// days); "feedback" has no single day, so it only requires having attended
// at least one day (they attended the course).

export function testDayNo(t: string): number | null {
  const m = /^day(\d+)$/.exec(t);
  return m ? Number(m[1]) : null;
}

/** Subject keys (`c<id>`/`p<id>`) PRESENT for this test's requirement.
 *  `null` = attendance unknown (pre-migration/transient error) — the caller
 *  must fail OPEN (never block a send over a DB hiccup). */
export async function loadPresentForTest(svc: Svc, corsoId: number, testKey: string): Promise<Set<string> | null> {
  let day = testDayNo(testKey);
  if (day == null && testKey === "final") {
    // The final exam requires presence at the EXAM-DAY roll call (the
    // "Giorno esame" appello tab, day_no = dayCount+1). If that number can't
    // be derived, fall back to any-day presence rather than blocking.
    try {
      day = (await courseDayInfo(corsoId)).examDay;
    } catch {
      day = null;
    }
  }
  let q = svc
    .from("corsi_presenze")
    .select("corsista_id, partecipante_id")
    .eq("corso_id", corsoId)
    .eq("present", true);
  if (day != null) q = q.eq("day_no", day);
  const { data, error } = await q;
  if (error) return null;
  const present = new Set<string>();
  for (const r of (data ?? []) as { corsista_id: number | null; partecipante_id: number | null }[]) {
    if (r.corsista_id != null) present.add(`c${r.corsista_id}`);
    else if (r.partecipante_id != null) present.add(`p${r.partecipante_id}`);
  }
  return present;
}

export function isBlockedByAbsence(present: Set<string> | null, subjectKey: string): boolean {
  if (present == null) return false; // unknown → fail open, never lock a send out
  return !present.has(subjectKey);
}

export function absentSendError(testKey: string): string {
  const day = testDayNo(testKey);
  if (day != null)
    return `Assente all'appello del giorno ${day}: non può ricevere questo test finché non risulta presente.`;
  if (testKey === "final")
    return "Assente all'appello del giorno d'esame: non può ricevere l'esame finché non risulta presente.";
  return "Mai presente all'appello: non può ricevere questo invio.";
}

/** Student-facing twin of absentSendError — shown when an ABSENT student tries
 *  to ACCESS a test (page load / email gate), not just receive it. Same rule:
 *  the student must be present at the roll-call to sit the test. */
export function absentAccessError(testKey: string): string {
  const day = testDayNo(testKey);
  if (day != null)
    return `Non risulti presente all'appello del giorno ${day}. Lo studente deve essere presente per sostenere l'esame — rivolgiti al tuo educator.`;
  if (testKey === "final")
    return "Non risulti presente all'appello del giorno d'esame. Lo studente deve essere presente per sostenere l'esame — rivolgiti al tuo educator.";
  return "Non risulti presente all'appello del corso. Lo studente deve essere presente per sostenere l'esame — rivolgiti al tuo educator.";
}

export interface SubjectProgress {
  /** 0-100 (submitted → 100). */
  pct: number;
  /** 1-based current question (display). */
  question: number;
  total: number;
  startedAt: string;
  updatedAt: string;
  submittedAt: string | null;
  /** Live auto-grading of the answers so far (objective questions only);
   *  null when the answers snapshot isn't available. */
  correct: number | null;
  wrong: number | null;
}

/** Core computation: live per-student progress + send stamps + presence for
 *  ONE (course, test). Missing table (pre-migration) → empty progress. */
export async function loadExamProgress(
  corsoId: number,
  testKey: string,
): Promise<{
  progress: Record<string, SubjectProgress>;
  sends: Record<string, import("./send-log").ExamSendStamp>;
  presentForTest: Record<string, boolean> | undefined;
}> {
  const svc = getSupabaseServiceClient();
  const t = testKey;
  const sends = await getExamSends(corsoId, t);
  const presentSet = await loadPresentForTest(svc, corsoId, t);
  const presentForTest = presentSet ? Object.fromEntries([...presentSet].map((k) => [k, true])) : undefined;
  type ProgRow = {
    corsista_id: number | null;
    partecipante_id: number | null;
    current_idx: number;
    total: number;
    started_at: string;
    updated_at: string;
    submitted_at: string | null;
    answers?: Record<string, string[] | string> | null;
  };
  // Two-tier select: WITH the answers snapshot (round-3 column), else without.
  let rows: ProgRow[] | null = null;
  const rich = await svc
    .from("exam_progress")
    .select("corsista_id, partecipante_id, current_idx, total, started_at, updated_at, submitted_at, answers")
    .eq("corso_id", corsoId)
    .eq("test_key", t);
  rows = rich.data as ProgRow[] | null;
  if (rich.error) {
    const base = await svc
      .from("exam_progress")
      .select("corsista_id, partecipante_id, current_idx, total, started_at, updated_at, submitted_at")
      .eq("corso_id", corsoId)
      .eq("test_key", t);
    rows = base.data as ProgRow[] | null;
    if (base.error) return { progress: {}, sends, presentForTest }; // pre-migration → no bars
  }

  // Live auto-grading on READ: one template load per call (answers included),
  // then the pure gradeAnswers per student. Objective questions only — the
  // same corrector the Esiti tab uses.
  const anyAnswers = (rows ?? []).some((r) => r.answers && Object.keys(r.answers).length > 0);
  let questions: PublicRunnerQuestion[] = [];
  if (anyAnswers) {
    const { data: corso } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
    const family = (corso?.type as string) === "shochu" ? "shochu" : "nihonshu";
    const exam = await loadPublicExam(String(corsoId), family, t as ExamTestKey, true).catch(() => null);
    questions = exam?.questions ?? [];
  }

  const progress: Record<string, SubjectProgress> = {};
  for (const r of rows ?? []) {
    const key = r.corsista_id != null ? `c${r.corsista_id}` : r.partecipante_id != null ? `p${r.partecipante_id}` : null;
    if (!key) continue;
    const total = Math.max(1, r.total);
    const pct = r.submitted_at ? 100 : Math.min(99, Math.round((r.current_idx / total) * 100));
    let correct: number | null = null;
    let wrong: number | null = null;
    if (r.answers && questions.length > 0) {
      const { detail } = gradeAnswers(questions, r.answers);
      correct = detail.filter((a) => a.ok === true).length;
      wrong = detail.filter((a) => a.ok === false).length;
    }
    progress[key] = {
      pct,
      question: Math.min(total, r.current_idx + 1),
      total: r.total,
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      submittedAt: r.submitted_at,
      correct,
      wrong,
    };
  }
  return { progress, sends, presentForTest };
}
