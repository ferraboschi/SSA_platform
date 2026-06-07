import "server-only";

// Web-push subscriptions, persisted in settings_kv (no migration needed). Fine
// for a staff/educator-sized audience; move to a dedicated table if it grows.
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Auth user id this subscription belongs to (for targeted sends). */
  userId: string | null;
  ua?: string;
  createdAt: string;
}

const KEY = "push-subscriptions";

async function read(): Promise<PushSub[]> {
  const svc = getSupabaseServiceClient();
  const { data } = await svc.from("settings_kv").select("value").eq("key", KEY).maybeSingle();
  const v = data?.value as { subs?: PushSub[] } | PushSub[] | null;
  if (!v) return [];
  return Array.isArray(v) ? v : v.subs ?? [];
}

async function write(subs: PushSub[]): Promise<void> {
  const svc = getSupabaseServiceClient();
  await svc.from("settings_kv").upsert({ key: KEY, value: { subs } }, { onConflict: "key" });
}

export async function addSubscription(sub: PushSub): Promise<void> {
  const subs = await read();
  const next = subs.filter((s) => s.endpoint !== sub.endpoint); // dedup by endpoint
  next.push(sub);
  await write(next);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const subs = await read();
  await write(subs.filter((s) => s.endpoint !== endpoint));
}

export async function listSubscriptions(userId?: string): Promise<PushSub[]> {
  const subs = await read();
  return userId ? subs.filter((s) => s.userId === userId) : subs;
}
