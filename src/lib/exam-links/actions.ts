"use server";

import { getSession } from "@/lib/auth/session";
import { appConfig } from "@/lib/integrations/config";
import {
  signExamToken,
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
