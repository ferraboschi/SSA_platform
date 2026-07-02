// Personal exam-link LIFECYCLE. Server-only (except the pure time helper).
//
// The owner's model: a sent test link lives until the END OF THE DAY it was sent
// (Europe/Rome — courses are Italian), unless the educator explicitly (a) keeps
// it alive longer (e.g. the feedback) or (b) CLOSES it for everyone early.
//
// Tokens are stateless, so:
//  • the end-of-day default is simply the token's own expiry (`e`), computed at
//    send time — no store needed;
//  • CLOSE-ALL needs one tiny record: settings_kv key "exam_link_closures" maps
//    `<corsoId>:<testKey>` → closedAt ISO. The public exam page rejects an
//    exam-mode token whose ISSUE time (`ia`) predates the closure (tokens without
//    `ia` — pre-lifecycle — are rejected too when a closure exists). Re-sending
//    AFTER a closure mints tokens with a fresh `ia` > closedAt, so a re-send
//    naturally re-opens access for exactly the people the educator re-invites.
import "server-only";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { endOfDayEpochSeconds } from "./lifecycle-time";

export const CLOSURES_KEY = "exam_link_closures";

/** Link duration choices offered to the educator at send time. */
export type ExamLinkTtlChoice = "eod" | "7d";

/** Expiry epoch (seconds) for a choice, minted now. */
export function expiryForChoice(choice: ExamLinkTtlChoice): number {
  if (choice === "7d") return Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  return endOfDayEpochSeconds("Europe/Rome", new Date());
}

interface StoredClosures {
  items?: Record<string, string>; // `<corsoId>:<testKey>` → closedAt ISO
}

function closureKey(corsoId: number, testKey: string): string {
  return `${corsoId}:${testKey}`;
}

async function readClosures(): Promise<Record<string, string>> {
  try {
    const svc = getSupabaseServiceClient();
    const { data } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", CLOSURES_KEY)
      .maybeSingle();
    return (data?.value as StoredClosures | null)?.items ?? {};
  } catch {
    return {}; // settings_kv unavailable → no closures (links live their TTL)
  }
}

/** closedAt ISO for a (course, test), or null if not closed. */
export async function getClosure(corsoId: number, testKey: string): Promise<string | null> {
  const items = await readClosures();
  return items[closureKey(corsoId, testKey)] ?? null;
}

/** All closures for one course, keyed by testKey. */
export async function getCourseClosures(corsoId: number): Promise<Record<string, string>> {
  const items = await readClosures();
  const out: Record<string, string> = {};
  const prefix = `${corsoId}:`;
  for (const [k, v] of Object.entries(items)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

export async function setClosure(corsoId: number, testKey: string): Promise<boolean> {
  try {
    const svc = getSupabaseServiceClient();
    const items = await readClosures();
    items[closureKey(corsoId, testKey)] = new Date().toISOString();
    const { error } = await svc
      .from("settings_kv")
      .upsert({ key: CLOSURES_KEY, value: { items } }, { onConflict: "key" });
    return !error;
  } catch {
    return false;
  }
}

export async function clearClosure(corsoId: number, testKey: string): Promise<boolean> {
  try {
    const svc = getSupabaseServiceClient();
    const items = await readClosures();
    delete items[closureKey(corsoId, testKey)];
    const { error } = await svc
      .from("settings_kv")
      .upsert({ key: CLOSURES_KEY, value: { items } }, { onConflict: "key" });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Is an exam-mode token (issued at `issuedAt` epoch seconds, possibly undefined
 * for pre-lifecycle tokens) blocked by a closure? Blocked when a closure exists
 * AND the token was NOT minted after it.
 */
export function isBlockedByClosure(
  closedAtIso: string | null,
  issuedAt: number | undefined,
): boolean {
  if (!closedAtIso) return false;
  const closedAt = Math.floor(new Date(closedAtIso).getTime() / 1000);
  if (!Number.isFinite(closedAt)) return false;
  return issuedAt == null || issuedAt <= closedAt;
}
