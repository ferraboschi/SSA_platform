"use server";

// Client-callable: save / remove the current user's push subscription.
import { getSession } from "@/lib/auth/session";
import { addSubscription, removeSubscription } from "./store";

export async function savePushSubscriptionAction(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ua?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, error: "Iscrizione push non valida." };
  }
  const session = await getSession();
  await addSubscription({
    endpoint: sub.endpoint,
    keys: sub.keys,
    userId: session?.user?.id ?? null,
    ua: sub.ua,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<{ ok: boolean }> {
  if (endpoint) await removeSubscription(endpoint);
  return { ok: true };
}
