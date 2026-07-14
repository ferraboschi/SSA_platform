"use server";

import { getSession } from "@/lib/auth/session";
import { appConfig } from "@/lib/integrations/config";
import { signShareToken, SHARE_LINK_TTL_HOURS } from "./token";
import { seedCourseProgramDays } from "@/lib/corsi/program-seed";

export interface CreateShareLinkResult {
  /** Days auto-added to an empty program at share time (owner's rule) —
   *  shown in the dialog so the operator knows what happened. */
  seededDays?: number;
  ok: boolean;
  url?: string;
  expiresAt?: string;
  error?: string;
}

/** Mint a signed, expiring read-only share link for a course. Staff-only. */
export async function createShareLink(
  courseId: string,
): Promise<CreateShareLinkResult> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  // Owner's rule (batch 7): never fabricate days at display time. Sharing a
  // course whose program has NO days adds the expected ones automatically —
  // as real, editable entries — and the dialog tells the operator.
  let seededDays = 0;
  if (/^\d+$/.test(courseId)) {
    seededDays = await seedCourseProgramDays(Number(courseId)).catch(() => 0);
  }
  const exp = Math.floor(Date.now() / 1000) + SHARE_LINK_TTL_HOURS * 3600;
  const token = signShareToken({ c: courseId, e: exp });
  const base = appConfig.baseUrl.replace(/\/$/, "");
  return {
    ok: true,
    url: `${base}/condividi/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    ...(seededDays > 0 ? { seededDays } : {}),
  };
}

/** Mint a signed, expiring read-only share link for the Pianificatore. Staff-only.
 *  Uses the sentinel course id "planner" handled by /condividi/[token]. */
export async function createPlannerShareLink(): Promise<CreateShareLinkResult> {
  const session = await getSession();
  const roleKey = session?.user?.roleKey;
  if (roleKey !== "admin" && roleKey !== "manager") {
    return { ok: false, error: "Non autorizzato." };
  }
  const exp = Math.floor(Date.now() / 1000) + SHARE_LINK_TTL_HOURS * 3600;
  const token = signShareToken({ c: "planner", e: exp });
  const base = appConfig.baseUrl.replace(/\/$/, "");
  return {
    ok: true,
    url: `${base}/condividi/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}
