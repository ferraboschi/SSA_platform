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

/** One settings_kv row PER closure (key = `exam_link_closure:<corsoId>:<testKey>`,
 *  value = { closedAt }). Single-row upsert/delete are atomic, so concurrent
 *  close/reopen actions can never lose each other's writes (no shared-map
 *  read-modify-write). Reads fail open — a transient error never locks students
 *  out; it only means a closure isn't seen for that one request. */
export const CLOSURE_KEY_PREFIX = "exam_link_closure:";

/** Link duration choices offered to the educator at send time. */
export type ExamLinkTtlChoice = "eod" | "7d";

/** Expiry epoch (seconds) for a choice, minted now. */
export function expiryForChoice(choice: ExamLinkTtlChoice): number {
  if (choice === "7d") return Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  return endOfDayEpochSeconds("Europe/Rome", new Date());
}

interface StoredClosure {
  closedAt?: string; // ISO
}

function closureKey(corsoId: number, testKey: string): string {
  return `${CLOSURE_KEY_PREFIX}${corsoId}:${testKey}`;
}

/** closedAt ISO for a (course, test), or null if not closed. */
export async function getClosure(corsoId: number, testKey: string): Promise<string | null> {
  try {
    const svc = getSupabaseServiceClient();
    const { data, error } = await svc
      .from("settings_kv")
      .select("value")
      .eq("key", closureKey(corsoId, testKey))
      .maybeSingle();
    if (error) return null; // fail open — never lock students out on a blip
    return (data?.value as StoredClosure | null)?.closedAt ?? null;
  } catch {
    return null;
  }
}

/** All closures for one course, keyed by testKey. */
export async function getCourseClosures(corsoId: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const svc = getSupabaseServiceClient();
    const prefix = `${CLOSURE_KEY_PREFIX}${corsoId}:`;
    const { data, error } = await svc
      .from("settings_kv")
      .select("key, value")
      .like("key", `${prefix}%`);
    if (error) return out;
    for (const r of (data ?? []) as { key: string; value: StoredClosure | null }[]) {
      const closedAt = r.value?.closedAt;
      if (closedAt) out[r.key.slice(prefix.length)] = closedAt;
    }
  } catch {
    /* fail open */
  }
  return out;
}

/** Atomic single-row upsert — concurrent closes can never lose each other. */
export async function setClosure(corsoId: number, testKey: string): Promise<boolean> {
  try {
    const svc = getSupabaseServiceClient();
    const { error } = await svc
      .from("settings_kv")
      .upsert(
        { key: closureKey(corsoId, testKey), value: { closedAt: new Date().toISOString() } },
        { onConflict: "key" },
      );
    return !error;
  } catch {
    return false;
  }
}

/** Atomic single-row delete. */
export async function clearClosure(corsoId: number, testKey: string): Promise<boolean> {
  try {
    const svc = getSupabaseServiceClient();
    const { error } = await svc
      .from("settings_kv")
      .delete()
      .eq("key", closureKey(corsoId, testKey));
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
