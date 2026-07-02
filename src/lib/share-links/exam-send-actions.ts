"use server";

// Send PERSONAL exam links from the educator SHARE LINK (no login → authorized by
// the course share token). Each link is bound to one corsista (token `s`) so the
// exam submission ties back to the right student, and it's delivered to that
// student's confirmed/target email — go-live gated (never a student in test mode;
// the link is returned for a WhatsApp/SMS fallback). Same token-auth posture as
// the appello: re-verify the token, derive the course from it, bind the corsista
// to THIS course before any send.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { createFixedWindowLimiter } from "@/lib/rate-limit";
import { verifyShareToken } from "./token";
import { deliverExamInvite } from "@/lib/exam-links/invite-email";
import { setClosure, clearClosure, type ExamLinkTtlChoice } from "@/lib/exam-links/lifecycle";
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
  live?: boolean;
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
  return { ok: true, ...res };
}

export interface SendExamLinksAllResult {
  ok: boolean;
  live?: boolean;
  total?: number;
  sent?: number;
  noEmail?: number;
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
  const cname = await courseName(svc, corsoId);

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
  let live = false;
  for (const r of rows) {
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
    live = res.live;
    if (res.sentTo) sent++;
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
        live = res.live;
        if (res.sentTo) sent++;
      }
    }
  }
  return { ok: true, live, total: rows.length + companions, sent, noEmail };
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
