"use server";

import { getSession } from "@/lib/auth/session";
import { appConfig } from "@/lib/integrations/config";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import {
  signExamToken,
  verifyExamToken,
  EXAM_LINK_TTL_HOURS,
  type ExamTestKey,
  type ExamLinkMode,
} from "./token";
import { loadPresentForTest, isBlockedByAbsence, absentAccessError } from "./live-progress";
import { getClosure, isBlockedByClosure } from "./lifecycle";
import { buildDayEsito, type DayEsito } from "./esito";
import { runSingleSubmissionCorrection } from "@/lib/esami/correction-run";
import { after } from "next/server";
import { loadPublicExam } from "./load";
import { explainQuestionWithKb } from "@/lib/rag/explain";
import { createFixedWindowLimiter } from "@/lib/rate-limit";

export interface CreateExamLinkInput {
  courseId: string;
  testKey: ExamTestKey;
  mode: ExamLinkMode;
  lang?: string;
}
export interface CreateExamLinkResult {
  ok: boolean;
  url?: string;
  expiresAt?: string;
  error?: string;
}

/**
 * Mint a signed, expiring exam link for a course's test. Staff-only.
 * `mode: "exam"` → real student session; `mode: "test"` → preview.
 */
export async function createExamLink(
  input: CreateExamLinkInput,
): Promise<CreateExamLinkResult> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  // Only real exam courses may get an exam link. Downstream the runner maps
  // course.type to a family with `type === "shochu" ? "shochu" : "nihonshu"`,
  // so ANY other type (introduttivo/masterclass/…) would be silently treated
  // as the nihonshu certification exam. Guard against that at the source.
  const svc = getSupabaseServiceClient();
  const { data: corso } = await svc
    .from("corsi")
    .select("type")
    .eq("id", Number(input.courseId))
    .maybeSingle();
  if (!corso) {
    return { ok: false, error: "Corso non trovato." };
  }
  if (corso.type !== "certificato" && corso.type !== "shochu") {
    return { ok: false, error: "Questo corso non prevede un esame (solo Certificato o Shochu)." };
  }
  const ttlH = EXAM_LINK_TTL_HOURS[input.mode];
  const exp = Math.floor(Date.now() / 1000) + ttlH * 3600;
  const token = signExamToken({
    c: input.courseId,
    t: input.testKey,
    m: input.mode,
    l: input.lang,
    e: exp,
  });
  const base = appConfig.baseUrl.replace(/\/$/, "");
  return {
    ok: true,
    url: `${base}/esame/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export interface SubmitExamInput {
  answers: Record<string, string[] | string>;
  lang?: string;
  elapsed?: number;
}

/**
 * Persist a public exam submission. The course / test / mode are derived from
 * the verified token (never trusted from the client). Only `mode: "exam"` is
 * written — test/validate are previews and must not create submissions.
 */
export async function submitExam(
  token: string,
  input: SubmitExamInput,
): Promise<{ ok: boolean; error?: string; alreadySubmitted?: boolean; esito?: DayEsito; closed?: boolean; expired?: boolean }> {
  // Submit keeps a 3h grace on the NATURAL end-of-day expiry so a student who
  // started before midnight can still hand in — otherwise their in-progress work
  // is silently orphaned (no expiry-side finalize exists). This grace can NEVER
  // bypass a CLOSURE: isBlockedByClosure below blocks any pre-closure token
  // regardless, so "Chiudi per tutti" still stops everyone instantly. `expired`
  // (past the grace) lets the runner show a terminal screen, not a retry loop.
  const res = verifyExamToken(token, 3 * 3600);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto.", expired: true };
  const { c, t, m, s, p } = res.payload;
  if (m !== "exam") return { ok: true }; // preview/validation: no write
  // A REAL exam submission must be bound to a subject (personal links carry
  // `s` or `p`; the email gate always mints one). An unbound exam-mode write
  // would be invisible to results AND dodge the per-subject unique index — the
  // one duplicate-insert hole left (two such legacy rows exist in prod).
  if (!s && !p) {
    return { ok: false, error: "Il tuo accesso non è più valido: apri il link personale o chiedi all'educator di reinviartelo." };
  }

  // Split out the registration fields ("reg:<field>") from graded answers.
  const registration: Record<string, string> = {};
  const answers: Record<string, string[] | string> = {};
  for (const [k, v] of Object.entries(input.answers ?? {})) {
    if (k.startsWith("reg:")) registration[k.slice(4)] = Array.isArray(v) ? v.join(", ") : v;
    else answers[k] = v;
  }

  const svc = getSupabaseServiceClient();
  const corsoId = /^\d+$/.test(c) ? Number(c) : null;
  const corsistaId = s && /^\d+$/.test(s) ? Number(s) : null;
  // Companion personal links carry `p` instead of `s` (at most one is set).
  const partecipanteId = p && /^\d+$/.test(p) ? Number(p) : null;

  // Owner's rule re-checked at HAND-IN: the page gate runs at render time, so
  // a student flipped to absent while the runner was already open (or someone
  // replaying the action with a still-valid token) must be refused here too.
  // Fail-open on unknown attendance, like every other gate.
  if (corsoId != null) {
    const present = await loadPresentForTest(svc, corsoId, t).catch(() => null);
    const subjKey = partecipanteId != null ? `p${partecipanteId}` : `c${corsistaId}`;
    if (isBlockedByAbsence(present, subjKey)) {
      return { ok: false, error: absentAccessError(t) };
    }
    // Closure / sandbox-reset epoch re-checked at HAND-IN too: a page still
    // open from before must not write fresh state back.
    const closedAt = await getClosure(corsoId, t);
    if (isBlockedByClosure(closedAt, res.payload.ia)) {
      // `closed` lets the runner show the honest "test chiuso" screen instead of
      // a generic "salvataggio non riuscito · Riprova" dead loop (every retry
      // would re-hit this block). The finalize-on-close already captured the
      // last heartbeated snapshot, so nothing further is lost here.
      return { ok: false, error: "Questo test è stato chiuso dall'educator.", closed: true };
    }
  }
  const row = {
    corso_id: corsoId,
    course_ref: c,
    test_key: t,
    mode: m,
    lang: input.lang ?? null,
    elapsed_seconds: input.elapsed ?? null,
    answers,
    registration: Object.keys(registration).length ? registration : null,
  };

  // Try to record which subject this was (personal links carry `s` OR `p`).
  // If a subject column isn't there yet (migration not applied), retry without
  // it so the submission is never lost — same degrade as the corsista rollout.
  //
  // The retry must ONLY fire for a genuinely MISSING COLUMN — never for an FK
  // violation (the FK constraint name contains the column name, so a bare
  // substring match would silently downgrade a deleted-subject submit into an
  // identity-less orphan row). Missing column: PostgREST PGRST204 / Postgres
  // 42703; FK violation: 23503 → explicit visible error instead.
  type DbErr = { code?: string; message: string };
  const isMissingColumn = (e: DbErr | null, col: string): boolean => {
    if (!e || !e.message.includes(col)) return false;
    if (e.code === "PGRST204" || e.code === "42703") return true;
    return /column|schema cache|does not exist/i.test(e.message);
  };
  const isSubjectFkViolation = (e: DbErr | null): boolean =>
    !!e &&
    (e.code === "23503" || /foreign key/i.test(e.message)) &&
    /partecipante_id|corsista_id/.test(e.message);

  const full: Record<string, unknown> = { ...row, corsista_id: corsistaId };
  if (partecipanteId != null) full.partecipante_id = partecipanteId;
  let submissionId: number | null = null;
  let { data: insData, error } = await svc.from("exam_submissions").insert(full).select("id");
  submissionId = (insData?.[0]?.id as number | undefined) ?? null;
  if (isSubjectFkViolation(error)) {
    // The bound subject no longer exists (deleted/merged mid-window). Refuse
    // loudly — a graded row with NO identity would be invisible to results.
    return { ok: false, error: "Il tuo accesso non è più valido: contatta l'educator per un nuovo link." };
  }
  if (error && isMissingColumn(error, "partecipante_id")) {
    ({ data: insData, error } = await svc
      .from("exam_submissions")
      .insert({ ...row, corsista_id: corsistaId })
      .select("id"));
    submissionId = (insData?.[0]?.id as number | undefined) ?? submissionId;
  }
  if (error && isMissingColumn(error, "corsista_id")) {
    ({ data: insData, error } = await svc.from("exam_submissions").insert(row).select("id"));
    submissionId = (insData?.[0]?.id as number | undefined) ?? submissionId;
  }
  if (error) {
    // This path shares the exam_submissions_proctored_uniq backstop index with
    // the proctored flow, so a re-submit hits a duplicate-key. Still ok:true
    // (a double-click must never scare the student), but flag it so the UI can
    // show "Esame già consegnato" instead of a fresh thank-you — the re-sent
    // answers were DISCARDED (the first submission is the graded one), and the
    // student must not believe an edit was recorded.
    if (/duplicate key|unique|23505/i.test(error.message)) {
      return { ok: true, alreadySubmitted: true };
    }
    return { ok: false, error: error.message };
  }

  // Close the LIVE PROGRESS row (educator's bar jumps to "Consegnato").
  // Best-effort: a missing table/row never affects the submission.
  if (corsoId != null && (corsistaId != null || partecipanteId != null)) {
    const subjCol = corsistaId != null ? "corsista_id" : "partecipante_id";
    await svc
      .from("exam_progress")
      .update({ submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("corso_id", corsoId)
      .eq("test_key", t)
      .eq(subjCol, (corsistaId ?? partecipanteId)!)
      .then(() => {}, () => {});
  }

  // Day tests are FORMATIVE (owner, batch 7): hand the student their outcome
  // right away, graded server-side. The FINAL exam is corrected too — but in the
  // background only, its outcome staying PRIVATE (released by the official
  // correction). Best-effort — a grading hiccup must never spoil a successful
  // hand-in (the runner falls back to the plain thank-you).
  let esito: DayEsito | undefined;
  const isDay = /^day[1-9]$/.test(t);
  if (corsoId != null && (isDay || t === "final")) {
    try {
      const { data: corso } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
      const family = corso?.type === "shochu" ? "shochu" : "nihonshu";
      if (isDay) {
        esito = (await buildDayEsito(c, family, t, answers, input.lang, submissionId ?? undefined)) ?? undefined;
        // Owner batch 8: open answers are AI-graded RIGHT AFTER hand-in, in the
        // background (same engine + draft store as the staff batch). The esito
        // card polls until the draft lands; the staff Esiti gets it for free.
        if (submissionId != null && esito?.aiPending) {
          const subId = submissionId;
          after(() => runSingleSubmissionCorrection(c, family, t, subId).catch(() => false));
        }
      } else if (submissionId != null) {
        // FINAL exam (owner batch 17): correct EVERY answer at hand-in — closed
        // AND open — so the staff Esiti has the AI grades ready without clicking
        // "Valuta con AI" per question. Runs in the BACKGROUND and returns no
        // esito: the student sees only the plain thank-you, never the final
        // outcome (that stays with the official correction).
        const subId = submissionId;
        after(() => runSingleSubmissionCorrection(c, family, t, subId).catch(() => false));
      }
    } catch {
      esito = undefined;
    }
  }
  return { ok: true, esito };
}

/**
 * Live link-state check, polled by the OPEN runner (owner batch 8): when the
 * educator closes the test, students with the page already open see the
 * "test chiuso" screen within seconds — no more answering into a void.
 */
export async function getLinkStateAction(
  token: string,
): Promise<{ ok: boolean; closed?: boolean; reason?: "closed" | "expired" }> {
  // Same 3h grace as submit: within it, a still-open runner keeps polling and the
  // student can hand in. A CLOSURE flips the screen to "test chiuso" immediately;
  // only a token past the grace reports reason:"expired" → terminal "scaduto".
  const res = verifyExamToken(token, 3 * 3600);
  if (!res.ok) {
    return res.reason === "expired"
      ? { ok: true, closed: true, reason: "expired" }
      : { ok: false };
  }
  if (res.payload.m !== "exam") return { ok: true, closed: false };
  try {
    const closedAt = await getClosure(Number(res.payload.c), res.payload.t);
    const closed = isBlockedByClosure(closedAt, res.payload.ia);
    return { ok: true, closed, reason: closed ? "closed" : undefined };
  } catch {
    return { ok: true, closed: false }; // fail open: never kick a student on a hiccup
  }
}

/**
 * Fresh formative esito for a day-test link — polled by the result card while
 * the submit-time AI evaluation is in flight, and usable on any re-open.
 */
export async function getDayEsitoAction(
  token: string,
): Promise<{ ok: boolean; esito?: DayEsito; error?: string }> {
  const res = verifyExamToken(token, 3 * 3600);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const { c, t, m, s, p } = res.payload;
  if (m !== "exam" || !/^day[1-9]$/.test(t)) return { ok: false, error: "Non disponibile." };
  if (!s && !p) return { ok: false, error: "Link non personale." };
  try {
    const svc = getSupabaseServiceClient();
    const corsoId = /^\d+$/.test(c) ? Number(c) : null;
    if (corsoId == null) return { ok: false, error: "Link non valido." };
    const corsistaId = s && /^\d+$/.test(s) ? Number(s) : null;
    const partecipanteId = p && /^\d+$/.test(p) ? Number(p) : null;
    const { data: prior } = await svc
      .from("exam_submissions")
      .select("id, answers, lang")
      .eq("corso_id", corsoId)
      .eq("test_key", t)
      .eq("mode", "exam")
      .eq(corsistaId != null ? "corsista_id" : "partecipante_id", (corsistaId ?? partecipanteId)!)
      // Deterministic pick if legacy duplicates exist — the FIRST hand-in
      // counts (same rule as the /esame prior-submission branch).
      .order("created_at", { ascending: true })
      .limit(1);
    const sub = prior?.[0] as
      | { id: number; answers?: Record<string, string | string[]> | null; lang?: string | null }
      | undefined;
    if (!sub) return { ok: false, error: "Nessuna consegna trovata." };
    const { data: corso } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
    const family = corso?.type === "shochu" ? "shochu" : "nihonshu";
    const esito = await buildDayEsito(c, family, t, sub.answers, sub.lang, sub.id);
    if (!esito) return { ok: false, error: "Esito non disponibile." };
    return { ok: true, esito };
  } catch {
    return { ok: false, error: "Esito non disponibile ora." };
  }
}

const explainLimiter = createFixedWindowLimiter(10 * 60_000);
const RATE_LIMIT_EXPLAIN = 30; // per token per 10 minutes

/**
 * KB-grounded formative deep-dive for ONE day-test question (owner, batch 7):
 * available to whoever holds a valid link for that test (any mode — previews
 * too, so staff can demo it). The explanation depends on the question, not the
 * student, so it is cached per (family, test, question, lang) and generated at
 * most once — cost stays flat no matter how many students tap it.
 */
export async function getExamExplanationAction(
  token: string,
  qid: string,
  lang?: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const res = verifyExamToken(token, 3 * 3600);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const { c, t } = res.payload;
  if (!/^day[1-9]$/.test(t)) return { ok: false, error: "Approfondimenti disponibili solo per i test giornalieri." };
  if (explainLimiter.isLimited("explain", token, RATE_LIMIT_EXPLAIN)) {
    return { ok: false, error: "Troppe richieste, riprova tra poco." };
  }
  const cleanQid = String(qid).slice(0, 80);
  const lg = lang === "en" || lang === "ja" ? lang : "it";

  try {
    const svc = getSupabaseServiceClient();
    const corsoId = /^\d+$/.test(c) ? Number(c) : null;
    if (corsoId == null) return { ok: false, error: "Link non valido." };
    const { data: corso } = await svc.from("corsi").select("type").eq("id", corsoId).maybeSingle();
    const family = corso?.type === "shochu" ? "shochu" : "nihonshu";

    // Shared cache: the SAME explanation serves every student of the family's
    // template (plain upsert — worst case a concurrent miss regenerates once).
    const cacheKey = `exam-explain:${family}:${t}:${cleanQid}:${lg}`;
    const { data: cached } = await svc.from("settings_kv").select("value").eq("key", cacheKey).maybeSingle();
    const hit = (cached?.value as { text?: string } | null)?.text;
    if (hit) return { ok: true, text: hit };

    const exam = await loadPublicExam(c, family, t as ExamTestKey, true);
    const q = exam?.questions.find((x) => x.id === cleanQid);
    if (!q) return { ok: false, error: "Domanda non trovata." };

    const qText = (lg !== "it" && q.i18n?.[lg]?.text) || q.text;
    // Correct answer in a human-readable form, mirroring the grader semantics.
    let correctAnswer = "";
    const key = q.correct ?? [];
    if (q.type === "order") correctAnswer = key.map(String).join(" → ");
    else if (q.type === "fill") correctAnswer = key.map(String).join(", ");
    else if (key.length > 0) {
      correctAnswer = key.map((i) => q.options[Number(i)]).filter(Boolean).join(", ");
    }

    const out = await explainQuestionWithKb({ question: qText, correctAnswer, lang: lg });
    if (!out.ok || !out.text) {
      return { ok: false, error: "Approfondimento non disponibile per questa domanda." };
    }
    await svc
      .from("settings_kv")
      .upsert({ key: cacheKey, value: { text: out.text, at: new Date().toISOString() } }, { onConflict: "key" })
      .then(() => {}, () => {});
    return { ok: true, text: out.text };
  } catch {
    return { ok: false, error: "Approfondimento non disponibile ora, riprova più tardi." };
  }
}
