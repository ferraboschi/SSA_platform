import "server-only";

// Web-push sender. Requires VAPID keys in env (see scripts/generate-vapid.mjs):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
// No-ops cleanly when unconfigured, so wiring this into notification events is
// safe even before the keys are set.
import webpush from "web-push";
import { listSubscriptions, removeSubscription, type PushSub } from "./store";

let configured = false;
function ensureVapid(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:corsi@sakesommelierassociation.it",
      pub,
      priv,
    );
    configured = true;
  }
  return true;
}

export function pushConfigured(): boolean {
  return ensureVapid();
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export async function sendPush(
  subs: PushSub[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; skipped?: boolean }> {
  if (!ensureVapid()) return { sent: 0, failed: 0, skipped: true };
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 → the subscription is dead; prune it.
        if (code === 404 || code === 410) {
          await removeSubscription(s.endpoint).catch(() => {});
        }
      }
    }),
  );
  return { sent, failed };
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  return sendPush(await listSubscriptions(userId), payload);
}

export async function sendPushToAll(payload: PushPayload) {
  return sendPush(await listSubscriptions(), payload);
}
