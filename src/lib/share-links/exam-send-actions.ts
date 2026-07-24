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
import { deliverExamInvite, buildPersonalExamUrl } from "@/lib/exam-links/invite-email";
import { recordExamSend } from "@/lib/exam-links/send-log";
import { setClosure, clearClosure, type ExamLinkTtlChoice } from "@/lib/exam-links/lifecycle";
import { finalizeInProgressOnClose, undoCloseFinalized } from "@/lib/exam-links/close-finalize";
import { loadTemplateTests } from "@/lib/exam-links/template-tests";
import { loadFeedbackForCourse } from "@/lib/esami/feedback-templates-actions";
import type { CourseTypeKey } from "@/lib/domain";
import type { ExamTestKey } from "@/lib/exam-links/token";
// NOTE: no `export type { … }` re-exports here — this is a "use server"
// module, and Next's action transform registers every export CLAUSE name as a
// server action, generating a runtime reference to the (erased) type binding.
// That crashes the whole actions loader for any page using this module:
// every action on the page 500s. Clients needing SubjectProgress import the
// type directly from lib/exam-links/live-progress (type-only → erased).
import {
  VALID_TEST,
  loadPresentForTest,
  isBlockedByAbsence,
  absentSendError,
  loadExamProgress,
  type SubjectProgress,
} from "@/lib/exam-links/live-progress";
import { subjectKeyOf } from "@/lib/exam-links/access";

const limiter = createFixedWindowLimiter(60_000);
const RATE_LIMIT_SEND = 120;

type Svc = ReturnType<typeof getSupabaseServiceClient>;

function courseIdFromToken(token: string): number | null {
  const res = verifyShareToken(token);
  if (!res.ok) return null;
  const c = res.payload.c;
  return /^\d+$/.test(c) ? Number(c) : null;
}

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
  const { data } = await svc.from("corsi").select("type, delivery_mode").eq("id", corsoId).maybeSingle();
  // Feedback lives in the current editor (feedback-templates store, per
  // type × delivery), not in the legacy family template — resolve it from the
  // SAME source the runner serves, or a configured feedback is wrongly refused.
  if (testKey === "feedback") {
    const fb = await loadFeedbackForCourse(
      (data?.type as CourseTypeKey) ?? "certificato",
      (data?.delivery_mode as string | null) ?? null,
    ).catch(() => ({ questions: [] as unknown[] }));
    return (fb.questions?.length ?? 0) > 0 ? null : "Feedback non ancora configurato (nessuna domanda).";
  }
  const family = (data?.type as string) === "shochu" ? "shochu" : "nihonshu";
  const tests = await loadTemplateTests(family);
  const t = tests.find((x) => x.key === testKey);
  if (!t) return "Questo test non esiste per questo tipo di corso.";
  if (!t.configured) return "Test non ancora configurato (nessuna domanda).";
  return null;
}

// Guard + resolve a companion's name + confirmed email. Course-bound (null on
// mismatch) like corsistaTarget; degrades to no email if the column is absent.
async function partecipanteTarget(
  svc: Svc,
  corsoId: number,
  partecipanteId: number,
): Promise<{ name: string; email: string; confirmed: boolean } | null> {
  const { data, error } = await svc
    .from("corsi_partecipanti")
    .select("id, full_name, email, email_confirmed_at")
    .eq("id", partecipanteId)
    .eq("corso_id", corsoId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as { full_name: string | null; email?: string | null; email_confirmed_at?: string | null };
  return { name: r.full_name ?? "", email: (r.email ?? "").trim(), confirmed: Boolean(r.email_confirmed_at) };
}

// Guard + resolve a corsista's name + target email (enrolled_email snapshot
// preferred, corsisti.email fallback; degrades if the column is absent).
async function corsistaTarget(
  svc: Svc,
  corsoId: number,
  corsistaId: number,
): Promise<{ name: string; email: string; confirmed: boolean } | null> {
  const { data, error } = await svc
    .from("corsi_iscrizioni")
    .select("id, email_confirmed_at, corsista:corsisti(full_name, email)")
    .eq("corso_id", corsoId)
    .eq("corsista_id", corsistaId)
    .maybeSingle();
  if (error || !data) return null;
  // The nested to-one join is typed as an array by the client but is a single
  // object at runtime — cast through unknown (mirrors load.ts).
  const row = data as unknown as {
    id: number;
    email_confirmed_at: string | null;
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
  return { name: c.full_name ?? "", email, confirmed: Boolean(row.email_confirmed_at) };
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

/** Shared send-eligibility gate for the SINGLE-subject actions (send + copy),
 *  in the historical order with the exact messages: test configured → present at
 *  appello → subject belongs to this course → data confirmed. Returns the
 *  resolved target (name + email + subjKey) or the block error. Assumes `cid` is
 *  already validated (positive integer) by the caller. The bulk "send to all"
 *  path keeps its OWN per-loop sequence (different counter semantics — do not
 *  route it through here). */
async function resolveSendTarget(
  svc: Svc,
  corsoId: number,
  testKey: string,
  cid: number,
  kind: "corsista" | "partecipante",
): Promise<
  | {
      ok: true;
      k: "corsista" | "partecipante";
      subjKey: string;
      target: { name: string; email: string; confirmed: boolean };
    }
  | { ok: false; error: string }
> {
  const k = kind === "partecipante" ? "partecipante" : "corsista";
  const notReady = await unconfiguredError(svc, corsoId, testKey);
  if (notReady) return { ok: false, error: notReady };

  const subjKey = subjectKeyOf(
    k === "corsista"
      ? { corsistaId: cid, partecipanteId: null }
      : { corsistaId: null, partecipanteId: cid },
  )!;
  // Presence gate — for feedback this is the LAST program day's roll-call
  // (resolved inside loadPresentForTest), consistent with the open/submit gates.
  const present = await loadPresentForTest(svc, corsoId, testKey);
  if (isBlockedByAbsence(present, subjKey)) return { ok: false, error: absentSendError(testKey) };

  const target =
    k === "corsista"
      ? await corsistaTarget(svc, corsoId, cid)
      : await partecipanteTarget(svc, corsoId, cid);
  if (!target) return { ok: false, error: "Destinatario non trovato in questo corso." };
  // Owner (debug call): never send/mint the identity-bearing link before the
  // student has CONFIRMED (sanitized) their data.
  if (!target.confirmed) {
    return {
      ok: false,
      error: "Lo studente non ha ancora confermato i suoi dati: attendi la conferma nell'Appello.",
    };
  }
  return { ok: true, k, subjKey, target };
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

  const svc = getSupabaseServiceClient();
  const gate = await resolveSendTarget(svc, corsoId, t, cid, kind);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { target, subjKey } = gate;

  const res = await deliverExamInvite({
    courseId: String(corsoId),
    testKey: t as ExamTestKey,
    subject: { kind: gate.k, id: String(cid) },
    testLabel: testLabel(t),
    toEmail: target.email,
    name: target.name,
    courseName: await courseName(svc, corsoId),
    ttl: ttlChoice(ttl),
  });
  if (res.sentTo) {
    const at = new Date().toISOString();
    await recordExamSend(corsoId, t, subjKey, res.sentTo, at);
    return { ok: true, ...res, sentAt: at };
  }
  return { ok: true, ...res };
}

/**
 * MINT the personal exam link for one subject WITHOUT emailing it — for a
 * student who has no email/WhatsApp, so the educator can hand the link over by
 * another channel (SMS, dictate, print). Same guards as sendPersonalExamLinkAction
 * (course from token, test configured, not absent, subject belongs to course);
 * stamps the send log with method "copy", so the row reads "Copiato HH:MM".
 */
export async function getPersonalExamLinkAction(
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

  const svc = getSupabaseServiceClient();
  // Same eligibility gate as the email send (test configured, present, owned,
  // confirmed): the copied link carries the student's identity too.
  const gate = await resolveSendTarget(svc, corsoId, t, cid, kind);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { target, subjKey } = gate;

  const url = buildPersonalExamUrl(
    String(corsoId),
    t as ExamTestKey,
    { kind: gate.k, id: String(cid) },
    ttlChoice(ttl),
  );
  const at = new Date().toISOString();
  // Copied, not emailed: the stamp records method "copy" so the roster row
  // honestly reads "Copiato HH:MM" instead of "Inviato".
  await recordExamSend(corsoId, t, subjKey, target.email || "link-manuale", at, "copy");
  return { ok: true, url, sentAt: at };
}

export interface SendExamLinksAllResult {
  ok: boolean;
  total?: number;
  sent?: number;
  noEmail?: number;
  /** Skipped because absent at the appello (this test's day, or every day
   *  for feedback/final) — the owner's rule: never invite an absent student. */
  absent?: number;
  /** Skipped because the student hasn't confirmed their data yet. */
  notConfirmed?: number;
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
    .select("corsista_id, email_confirmed_at, corsista:corsisti(full_name, email)")
    .eq("corso_id", corsoId)
    .is("annullata_at", null); // a student removed from the course must not be sent
  const rows = (data ?? []) as unknown as {
    corsista_id: number;
    email_confirmed_at: string | null;
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
  let notConfirmed = 0;
  for (const r of rows) {
    const subjKey = subjectKeyOf({ corsistaId: r.corsista_id, partecipanteId: null })!;
    if (isBlockedByAbsence(present, subjKey)) {
      absent++;
      continue;
    }
    // Never send before the student confirmed their data — symmetric with the
    // companions branch below and the single-send gate (owner debug call).
    if (!r.email_confirmed_at) {
      notConfirmed++;
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
      await recordExamSend(corsoId, t, subjKey, res.sentTo, new Date().toISOString());
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
        const subjKey = subjectKeyOf({ corsistaId: null, partecipanteId: pr.id })!;
        if (isBlockedByAbsence(present, subjKey)) {
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
          await recordExamSend(corsoId, t, subjKey, res.sentTo, new Date().toISOString());
        }
      }
    }
  }
  return { ok: true, total: rows.length + companions, sent, noEmail, absent, notConfirmed };
}

// ── Live progress (educator's per-student bar) ──────────────────────────────
// The query/grading logic itself lives in lib/exam-links/live-progress.ts,
// shared with the INTERNAL staff action (course detail's Esiti tab) — this
// wrapper only re-verifies the token and rate-limits, same as every other
// action on this page.

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
  sends?: Record<string, import("@/lib/exam-links/send-log").ExamSendStamp>;
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

  const result = await loadExamProgress(corsoId, t);
  return { ok: true, ...result };
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
  // Close FIRST (stops any new writes), THEN finalize the still-open sittings.
  // Ordering matters: once setClosure lands, the heartbeat gate rejects any
  // resurrection, so a late heartbeat's `.is(submitted_at, null)` update no-ops
  // against a stamped row.
  const ok = await setClosure(corsoId, t);
  if (!ok) return { ok: false, error: "Chiusura non riuscita, riprova." };
  // AWAIT finalize (don't background it): its undo-set (exam_close_finalized KV)
  // must be fully written before this returns, or a fast "Annulla consegne e
  // riapri" click could read an empty set and no-op while stranding students.
  // Best-effort — a finalize hiccup must not fail the close itself. The AI
  // grading it triggers stays in the background via after() inside finalize.
  await finalizeInProgressOnClose(corsoId, t).catch(() => {});
  return { ok: true };
}

export async function reopenExamLinksAction(
  token: string,
  testKey: string,
  undoFinalized = false,
): Promise<{ ok: boolean; error?: string; undone?: number }> {
  const corsoId = courseIdFromToken(token);
  if (corsoId == null) return { ok: false, error: "Link non valido o scaduto." };
  if (limiter.isLimited("send", token, RATE_LIMIT_SEND)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }
  const t = String(testKey);
  if (!VALID_TEST.test(t)) return { ok: false, error: "Test non valido." };
  const ok = await clearClosure(corsoId, t);
  if (!ok) return { ok: false, error: "Riapertura non riuscita, riprova." };
  // "Chiuso per sbaglio": also undo the submissions THIS close auto-finalized so
  // those students resume from where they were (never touches a real hand-in).
  if (undoFinalized) {
    const res = await undoCloseFinalized(corsoId, t);
    return { ok: true, undone: res.count };
  }
  return { ok: true };
}
