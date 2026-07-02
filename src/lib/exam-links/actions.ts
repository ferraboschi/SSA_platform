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
): Promise<{ ok: boolean; error?: string }> {
  // 3h submit-only grace: a link that expires end-of-day must never reject the
  // hand-in of a student who STARTED before the expiry (entry has zero grace).
  const res = verifyExamToken(token, 3 * 3600);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const { c, t, m, s, p } = res.payload;
  if (m !== "exam") return { ok: true }; // preview/validation: no write

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
  const full: Record<string, unknown> = { ...row, corsista_id: corsistaId };
  if (partecipanteId != null) full.partecipante_id = partecipanteId;
  let { error } = await svc.from("exam_submissions").insert(full);
  if (error && /partecipante_id/i.test(error.message)) {
    ({ error } = await svc.from("exam_submissions").insert({ ...row, corsista_id: corsistaId }));
  }
  if (error && /corsista_id/i.test(error.message)) {
    ({ error } = await svc.from("exam_submissions").insert(row));
  }
  if (error) {
    // This path shares the exam_submissions_proctored_uniq backstop index with
    // the proctored flow, so a double-submit (double-click / retry) hits a
    // duplicate-key — already recorded, so treat it as success (idempotent),
    // never a scary error to the student.
    if (/duplicate key|unique|23505/i.test(error.message)) return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
