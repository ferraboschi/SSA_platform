import { NextResponse } from "next/server";
import { hasRole } from "@/lib/auth/guard";
import { pushConfigured, sendPushToAll } from "@/lib/push/send";
import { listSubscriptions } from "@/lib/push/store";

// Gated diagnostic: sends a test push to ALL stored subscriptions. Admin session
// OR SYNC_SECRET. Used to verify the push pipeline once VAPID keys are set.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  const bySecret = Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
  const byAdmin = await hasRole(["admin"]).catch(() => false);
  if (!bySecret && !byAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, error: "VAPID keys non configurate (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)." });
  }
  const subs = await listSubscriptions();
  const res = await sendPushToAll({
    title: "Notifica di prova · SSA",
    body: "Le notifiche push funzionano 🎉",
    url: "/dashboard",
    tag: "push-test",
  });
  return NextResponse.json({ ok: true, subscriptions: subs.length, ...res });
}
