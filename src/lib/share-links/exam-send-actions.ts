"use server";

// Send PERSONAL exam links from the educator SHARE LINK (no login → authorized by
// the course share token). Each link is bound to one corsista (token `s`) so the
// exam submission ties back to the right student, and it's delivered LIVE to that
// student's confirmed/target email (owner decision — the URL is still returned
// for a WhatsApp/SMS fallback). Every delivered send is STAMPED in the send log
// so the "Inviato HH:MM" indication survives reloads. Same token-auth posture as
// the appello: re-verify the token, derive the course from it, bind the corsista
// to THIS course before any send.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { verifyShareToken } from "./token";
import { deliverExamInvite } from "@/lib/exam-links/invite-email";
import { recordExamSend, getExamSends } from "@/lib/exam-links/send-log";
import { setClosure, clearClosure, type ExamLinkTtlChoice } from "@/lib/exam-links/lifecycle";
import { loadTemplateTests } from "@/lib/exam-links/template-tests";
import { loadPublicExam, type PublicRunnerQuestion } from "@/lib/exam-links/load";
import { gradeAnswers } from "@/lib/exam-links/grading";
import type { ExamTestKey } from "@/lib/exam-links/token";

const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_SEND = 120;

type Svc = ReturnType<typeof getSupabaseServiceClient>;

function courseIdFromToken(token: string): number | null {
  const res = verifyShareToken(token);
  if (!res.ok) return null;
  const c = res.payload.c;
  return /^\d+$/.test(c) ? Number(c) : null;
}

// Whitelist the test key (never trust the client to name an arbitrary test).
const VALID_TEST = /^(day[1-9]|feedback|final)$/;
function testLabel(t: string): string {
  if (t === "final") return "Esame finale";
  if (t === "feedback") return "Feedback";
  const m = /^day(\d+)$/.exec(t);
  return m ? `Test giorno ${m[1]}` : "Test";
}

async function courseName(svc: Svc, corsoId: number): Promise<string> {
  const { data } = await svc
    .from("corsi")
    .select("short_title, full_title")
    .eq("id", corsoId)
    .maybeSingle();
  return (data?.short_title as string) || (data?.full_title as string) || "Corso SSA";
}

/** Server-side twin of the UI's "da configurare" state: a test with no
 *  questions in the family template must never be SENT (an empty exam would
 *  reach students). Returns an error string, or null when sendable. */
async function unconfiguredError(
  svc: Svc,
  corsoId: number,
  testKey: string,
): Promise<string | null> {
  const { data } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
  const family = (data?.type as string) === "shochu" ? "shochu" : "nihonshu";
  const tests = await loadTemplateTests(family);
  const t = tests.find((x) => x.key === testKey);
  if (!t) return "Questo test non esiste per questo tipo di corso.";
  if (!t.configured) return "Test non ancora configurato (nessuna domanda).";
  return null;
}

// ── Presence gate (owner's rule): an absent student must never be invited to
// an exam test. "dayN" ties to THAT appello day specifically (Camilla absent
// day 1 → can't get the day-1 test); "feedback"/"final" have no single day, so
// they require having attended at least one day (they attended the course).

function testDayNo(t: string): number | null {
  const m = /^day(\d+)$/.exec(t);
  return m ? Number(m[1]) : null;
}

/** Subject keys (`c<id>`/`p<id>`) PRESENT for this test's requirement.
 *  `null` = attendance unknown (pre-migration/transient error) — the caller
 *  must fail OPEN (never block a send over a DB hiccup). */
async function loadPresentForTest(svc: Svc, corsoId: number, testKey: string): Promise<Set<string> | null> {
  const day = testDayNo(testKey);
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

function isBlockedByAbsence(present: Set<string> | null, subjectKey: string): boolean {
  if (present == null) return false; // unknown → fail open, never lock a send out
  return !present.has(subjectKey);
}

function absentSendError(testKey: string): string {
  const day = testDayNo(testKey);
  return day != null
    ? `Assente all'appello del giorno ${day}: non può ricevere questo test finché non risulta presente.`
    : "Mai presente all'appello: non può ricevere questo invio.";
}

// Guard + resolve a companion's name + confirmed email. Course-bound (null on
// mismatch) like corsistaTarget; degrades to no email if the column is absent.
async function partecipanteTarget(
  svc: Svc,
  corsoId: number,
  partecipanteId: number,
): Promise<{ name: string; email: string } | null> {
  const { data, error } = await svc
    .from("corsi_partecipanti")
    .select("id, full_name, email")
    .eq("id", partecipanteId)
    .eq("corso_id", corsoId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as { full_name: string | null; email?: string | null };
  return { name: r.full_name ?? "", email: (r.email ?? "").trim() };
}

// Guard + resolve a corsista's name + target email (enrolled_email snapshot
// preferred, corsisti.email fallback; degrades if the column is absent).
async function corsistaTarget(
  svc: Svc,
  corsoId: number,
  corsistaId: number,
): Promise<{ name: string; email: string } | null> {
  const { data, error } = await svc
    .from("corsi_iscrizioni")
    .select("id, corsista:corsisti(full_name, email)")
    .eq("corso_id", corsoId)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (error || !data) return null;
  // The nested to-one join is typed as an array by the client but is a single
  // object at runtime — cast through unknown (mirrors load.ts).
  const row = data as unknown as {
    id: number;
    corsista: { full_name: string | null; email: string | null } | null;
  };
  const c = row.corsista;
  if (!c) return null;
  let email = (c.email ?? "").trim();
  const snap = await svc
    .from("corsi_iscrizioni")
    .select("enrolled_email")
    .eq("id", row.id)
    .maybeSingle();
  if (!snap.error && snap.data?.enrolled_email) email = String(snap.data.enrolled_email).trim();
  return { name: c.full_name ?? "", email };
}

export interface SendExamLinkResult {
  ok: boolean;
  url?: string;
  sentTo?: string;
  /** ISO stamp of THIS delivered send (mirrors the persisted send log). */
  sentAt?: string;
  error?: string;
}

// Whitelist the duration choice (never trust the client string).
function ttlChoice(v: unknown): ExamLinkTtlChoice {
  return v === "7d" ? "7d" : "eod";
}

/** Send one personal exam link to one subject (corsista or "doppio" companion).
 *  The kind is EXPLICIT — corsista and partecipante ids are separate sequences,
 *  so a bare number must never be assumed to be a corsista. */
export async function sendPersonalExamLinkAction(
  token: string,
  testKey: string,
  subjectId: number,
  ttl?: string,
  kind: "corsista" | "partecipante" = "corsista",
): Promise<SendExamLinkResult> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("send", token, RATE_LIMIT_SEND)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };
  const cid = Number(subjectId);
  if (!Number.isInteger(cid) || cid <= 0) return { ok: false, error: "Destinatario non valido." };
  const k = kind === "partecipante" ? "partecipante" : "corsista";

  const svc = getSupabaseServiceClient();
  const notReady = await unconfiguredError(svc, corsoId, t);
  if (notReady) return { ok: false, error: notReady };

  const present = await loadPresentForTest(svc, corsoId, t);
  if (isBlockedByAbsence(present, `${k === "corsista" ? "c" : "p"}${cid}`)) {
    return { ok: false, error: absentSendError(t) };
  }

  const target =
    k === "corsista"
      ? await corsistaTarget(svc, corsoId, cid)
      : await partecipanteTarget(svc, corsoId, cid);
  if (!target) return { ok: false, error: "Destinatario non trovato in questo corso." };

  const res = await deliverExamInvite({
    courseId: String(corsoId),
    testKey: t as ExamTestKey,
    subject: { kind: k, id: String(cid) },
    testLabel: testLabel(t),
    toEmail: target.email,
    name: target.name,
    courseName: await courseName(svc, corsoId),
    ttl: ttlChoice(ttl),
  });
  if (res.sentTo) {
    const at = new Date().toISOString();
    await recordExamSend(corsoId, t, `${k === "corsista" ? "c" : "p"}${cid}`, res.sentTo, at);
    return { ok: true, ...res, sentAt: at };
  }
  return { ok: true, ...res };
}

export interface SendExamLinksAllResult {
  ok: boolean;
  total?: number;
  sent?: number;
  noEmail?: number;
  /** Skipped because absent at the appello (this test's day, or every day
   *  for feedback/final) — the owner's rule: never invite an absent student. */
  absent?: number;
  error?: string;
}

/** Send the personal link for one test to EVERY enrolled corsista at once. */
export async function sendPersonalExamLinksToAllAction(
  token: string,
  testKey: string,
  ttl?: string,
): Promise<SendExamLinksAllResult> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("send", token, RATE_LIMIT_SEND)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };

  const svc = getSupabaseServiceClient();
  const notReady = await unconfiguredError(svc, corsoId, t);
  if (notReady) return { ok: false, error: notReady };
  const cname = await courseName(svc, corsoId);
  const present = await loadPresentForTest(svc, corsoId, t);

  const { data } = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id, corsista:corsisti(full_name, email)")
    .eq("corso_id", corsoId);
  const rows = (data ?? []) as unknown as {
    corsista_id: number;
    corsista: { full_name: string | null; email: string | null } | null;
  }[];

  const enrolledEmail = new Map<number, string>();
  const snap = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id, enrolled_email")
    .eq("corso_id", corsoId);
  if (!snap.error) {
    for (const r of (snap.data ?? []) as { corsista_id: number; enrolled_email: string | null }[]) {
      if (r.enrolled_email) enrolledEmail.set(r.corsista_id, r.enrolled_email.trim());
    }
  }

  let sent = 0;
  let noEmail = 0;
  let absent = 0;
  for (const r of rows) {
    if (isBlockedByAbsence(present, `c${r.corsista_id}`)) {
      absent++;
      continue;
    }
    const email = enrolledEmail.get(r.corsista_id) || (r.corsista?.email ?? "").trim();
    if (!email) {
      noEmail++;
      continue;
    }
    const res = await deliverExamInvite({
      courseId: String(corsoId),
      testKey: t as ExamTestKey,
      subject: { kind: "corsista", id: String(r.corsista_id) },
      testLabel: testLabel(t),
      toEmail: email,
      name: r.corsista?.full_name ?? "",
      courseName: cname,
      ttl: ttlChoice(ttl),
    });
    if (res.sentTo) {
      sent++;
      await recordExamSend(corsoId, t, `c${r.corsista_id}`, res.sentTo, new Date().toISOString());
    }
  }

  // Companions ("doppio") with a CONFIRMED email get their own personal link.
  // Keyed on corso_id directly (not iscrizione_id joins) so an orphaned
  // enrollment reference can never drop a companion. Degrades to none if the
  // email columns aren't migrated yet.
  let companions = 0;
  {
    const { data: parts, error: pErr } = await svc
      .from("corsi_partecipanti")
      .select("id, full_name, email, email_confirmed_at")
      .eq("corso_id", corsoId)
      .not("email", "is", null)
      .not("email_confirmed_at", "is", null);
    if (!pErr) {
      for (const pr of (parts ?? []) as { id: number; full_name: string | null; email: string | null }[]) {
        const email = (pr.email ?? "").trim();
        if (!email) continue;
        if (isBlockedByAbsence(present, `p${pr.id}`)) {
          absent++;
          continue;
        }
        companions++;
        const res = await deliverExamInvite({
          courseId: String(corsoId),
          testKey: t as ExamTestKey,
          subject: { kind: "partecipante", id: String(pr.id) },
          testLabel: testLabel(t),
          toEmail: email,
          name: pr.full_name ?? "",
          courseName: cname,
          ttl: ttlChoice(ttl),
        });
        if (res.sentTo) {
          sent++;
          await recordExamSend(corsoId, t, `p${pr.id}`, res.sentTo, new Date().toISOString());
        }
      }
    }
  }
  return { ok: true, total: rows.length + companions, sent, noEmail, absent };
}

// ── Live progress (educator's per-student bar) ──────────────────────────────

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

/**
 * PUBLIC (share token): live progress for every student on one test, keyed by
 * subject (`c<corsistaId>` / `p<partecipanteId>`), plus the persisted send
 * stamps (subject → ISO of the last delivered email). Polled by the Esami tab.
 * Missing table (pre-migration) → empty map.
 */
export async function getExamProgressAction(
  token: string,
  testKey: string,
): Promise<{
  ok: boolean;
  progress?: Record<string, SubjectProgress>;
  sends?: Record<string, string>;
  /** Subject keys present-for-this-test — undefined = attendance unknown (the
   *  UI must not restrict anything in that case). Drives the "Assente
   *  all'appello" hint + disabled Invia, mirroring the server-side gate. */
  presentForTest?: Record<string, boolean>;
  error?: string;
}> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("progress", token, 30)) return { ok: true, progress: undefined };
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };

  const svc = getSupabaseServiceClient();
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
    if (base.error) return { ok: true, progress: {}, sends, presentForTest }; // pre-migration → no bars
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
  return { ok: true, progress, sends, presentForTest };
}

// ── Lifecycle: close a test for everyone / reopen ───────────────────────────
// Closure blocks every exam-mode token for (course, test) issued BEFORE the
// closure; re-sending after it mints fresh tokens (`ia` > closedAt) → re-opens
// for exactly the people the educator re-invites. Token-auth as everywhere here.

export async function closeExamLinksAction(
  token: string,
  testKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("send", token, RATE_LIMIT_SEND)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };
  const ok = await setClosure(corsoId, t);
  return ok ? { ok: true } : { ok: false, error: "Chiusura non riuscita, riprova." };
}

export async function reopenExamLinksAction(
  token: string,
  testKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("send", token, RATE_LIMIT_SEND)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };
  const ok = await clearClosure(corsoId, t);
  return ok ? { ok: true } : { ok: false, error: "Riapertura non riuscita, riprova." };
}
