"use server";

import { getSession } from "@/lib/auth/session";
import { appConfig } from "@/lib/integrations/config";
import { signShareToken, SHARE_LINK_TTL_HOURS } from "./token";

export interface CreateShareLinkResult {
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
  const exp = Math.floor(Date.now() / 1000) + SHARE_LINK_TTL_HOURS * 3600;
  const token = signShareToken({ c: courseId, e: exp });
  const base = appConfig.baseUrl.replace(/\/$/, "");
  return {
    ok: true,
    url: `${base}/condividi/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
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
