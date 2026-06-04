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

export interface PersonalExamLink {
  corsistaId: number;
  name: string;
  email: string;
  url: string;
  expiresAt: string;
}
export interface CreatePersonalLinksResult {
  ok: boolean;
  links?: PersonalExamLink[];
  /** False when the links couldn't be persisted (migration not applied yet). */
  stored?: boolean;
  error?: string;
}

/**
 * Mint ONE personal, signed link per enrolled student for a test, embedding the
 * student id so their submission is tied back to them. Stores them in
 * exam_student_links (best-effort — if the table isn't there yet the links are
 * still returned, just not persisted). Staff-only.
 */
export async function createPersonalExamLinks(
  courseId: string,
  testKey: ExamTestKey,
  mode: ExamLinkMode = "exam",
): Promise<CreatePersonalLinksResult> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") return { ok: false, error: "Non autorizzato." };
  const corsoId = /^\d+$/.test(courseId) ? Number(courseId) : null;
  if (corsoId == null) return { ok: false, error: "Corso non valido." };

  const svc = getSupabaseServiceClient();
  const { data, error } = await svc
    .from("corsi_iscrizioni")
    .select("corsista_id, corsisti(id, full_name, email)")
    .eq("corso_id", corsoId);
  if (error) return { ok: false, error: error.message };

  const ttlH = EXAM_LINK_TTL_HOURS[mode];
  const exp = Math.floor(Date.now() / 1000) + ttlH * 3600;
  const expIso = new Date(exp * 1000).toISOString();
  const base = appConfig.baseUrl.replace(/\/$/, "");

  type CorsistaRow = { id: number; full_name: string; email: string };
  const links: PersonalExamLink[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const r of (data ?? []) as unknown as Array<{
    corsista_id: number;
    // PostgREST embeds a to-one relation as an object, but supabase-js types it
    // as an array — accept both.
    corsisti: CorsistaRow | CorsistaRow[] | null;
  }>) {
    const cor = Array.isArray(r.corsisti) ? r.corsisti[0] : r.corsisti;
    if (!cor) continue;
    const token = signExamToken({ c: courseId, t: testKey, m: mode, e: exp, s: String(cor.id) });
    links.push({
      corsistaId: cor.id,
      name: cor.full_name,
      email: cor.email,
      url: `${base}/esame/${token}`,
      expiresAt: expIso,
    });
    rows.push({ corso_id: corsoId, corsista_id: cor.id, test_key: testKey, mode, token, expires_at: expIso });
  }

  let stored = false;
  if (rows.length) {
    const { error: upErr } = await svc
      .from("exam_student_links")
      .upsert(rows, { onConflict: "corso_id,corsista_id,test_key,mode" });
    stored = !upErr; // table may not exist yet → links still returned
  }
  return { ok: true, links, stored };
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
  const res = verifyExamToken(token);
  if (!res.ok) return { ok: false, error: "Link non valido o scaduto." };
  const { c, t, m, s } = res.payload;
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

  // Try to record which enrolled student this was (personal links carry `s`).
  // If the corsista_id column isn't there yet (migration not applied), retry
  // without it so the submission is never lost.
  let { error } = await svc.from("exam_submissions").insert({ ...row, corsista_id: corsistaId });
  if (error && /corsista_id/i.test(error.message)) {
    ({ error } = await svc.from("exam_submissions").insert(row));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
