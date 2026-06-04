import "server-only";

// Authorization guards for server actions and pages. The anonymous fallback
// user resolves to the zero-capability "guest" role, so every role check here
// denies an unauthenticated principal — server actions are POST endpoints NOT
// covered by the (app) layout's login redirect, so they must self-authorize.

import { notFound } from "next/navigation";
import type { RoleKey } from "@/lib/domain";
import { getSession } from "./session";
import { ROLE_VIEWS } from "./roles";
import { NAV_ITEMS } from "./navigation";

const NAV_IDS = new Set(NAV_ITEMS.flatMap((i) => [i.id, ...(i.children ?? []).map((c) => c.id)]));

export async function currentRole(): Promise<RoleKey> {
  return (await getSession()).user.roleKey;
}

export async function hasRole(allowed: RoleKey[]): Promise<boolean> {
  return allowed.includes(await currentRole());
}

/** Throw if the caller's role is not in `allowed` (use in server actions). */
export async function assertRole(allowed: RoleKey[]): Promise<void> {
  if (!(await hasRole(allowed))) throw new Error("Non autorizzato.");
}

/** 404 a page when the current role hides this nav id (single source of truth:
 *  ROLE_VIEWS.hidden — same list that hides the sidebar link). */
export async function requireNavAccess(navId: string): Promise<void> {
  // Fail safe on an unknown nav id (developer typo) instead of silently allowing.
  if (!NAV_IDS.has(navId)) notFound();
  const role = await currentRole();
  if (ROLE_VIEWS[role]?.hidden.includes(navId)) notFound();
}
