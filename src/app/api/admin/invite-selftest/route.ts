import { NextResponse } from "next/server";
import {
  getInviteByTokenAction,
  acceptInviteAction,
  revokeInviteAction,
} from "@/lib/auth/supabase-actions";
import { getSupabaseServiceClient } from "@/lib/integrations/supabase/server";
import { hasRole } from "@/lib/auth/guard";

// Gated self-test for the staff-invite lifecycle. Injects a SYNTHETIC invite
// (fake @example.invalid email, userId:null → never creates/touches a real auth
// account) into settings_kv, then asserts the three new behaviours:
//   1. usage status      — opening the link stamps `openedAt`
//   2. email-bound link  — accept with the WRONG email is rejected
//   3. email-bound link  — accept with the RIGHT email gets past the email check
//   4. cancel (revoke)   — the invite row is removed afterwards
// The synthetic row is revoked at the end, so it leaves no residue. Admin-gated.
export const dynamic = "force-dynamic";

const KEY = "staff-invites";
const TEST_EMAIL = "selftest-invite@example.invalid";

interface Inv {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  userId: string | null;
  createdAt: string;
  lastSentAt: string;
  openedAt: string | null;
  acceptedAt: string | null;
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  const bySecret = Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
  const byAdmin = await hasRole(["admin"]).catch(() => false);
  if (!bySecret && !byAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const svc = getSupabaseServiceClient();
  const readKv = async (): Promise<Inv[]> => {
    const { data } = await svc.from("settings_kv").select("value").eq("key", KEY).maybeSingle();
    const v = data?.value as { invites?: Inv[] } | Inv[] | null;
    if (!v) return [];
    return Array.isArray(v) ? v : v.invites ?? [];
  };
  const writeKv = async (invites: Inv[]) => {
    await svc.from("settings_kv").upsert({ key: KEY, value: { invites } }, { onConflict: "key" });
  };

  const checks: { step: string; pass: boolean; detail: string }[] = [];
  const now = new Date().toISOString();
  const token = `selftest-${now.replace(/\D/g, "")}`;

  try {
    // Inject the synthetic invite (remove any leftover first).
    const base = (await readKv()).filter((i) => i.email !== TEST_EMAIL);
    base.push({
      token,
      email: TEST_EMAIL,
      firstName: "Selftest",
      lastName: "",
      role: "manager",
      userId: null,
      createdAt: now,
      lastSentAt: now,
      openedAt: null,
      acceptedAt: null,
    });
    await writeKv(base);

    // 1. Open the link → openedAt should be stamped.
    const looked = await getInviteByTokenAction(token);
    const afterOpen = (await readKv()).find((i) => i.email === TEST_EMAIL);
    checks.push({
      step: "usage-status: openedAt stamped on open",
      pass: !!afterOpen?.openedAt && looked?.accepted === false,
      detail: `openedAt=${afterOpen?.openedAt ?? "null"} · looked=${JSON.stringify(looked)}`,
    });

    // 2. Accept with the WRONG email → rejected (returns before any auth call).
    const wrong = await acceptInviteAction(token, "qualcunaltro@x.com", "password12345");
    checks.push({
      step: "email-bound: wrong email rejected",
      pass: wrong.ok === false && /non corrisponde/i.test(wrong.error ?? ""),
      detail: JSON.stringify(wrong),
    });

    // 3. Accept with the RIGHT email → passes the email check (then stops at
    //    'account non trovato' because the synthetic row has no real auth user,
    //    which proves the binding accepts the correct address).
    const right = await acceptInviteAction(token, TEST_EMAIL, "password12345");
    checks.push({
      step: "email-bound: correct email passes the binding check",
      pass: right.ok === false && !/non corrisponde/i.test(right.error ?? ""),
      detail: JSON.stringify(right),
    });

    // 4. Revoke → the row is gone.
    const rev = await revokeInviteAction(TEST_EMAIL);
    const afterRevoke = (await readKv()).some((i) => i.email === TEST_EMAIL);
    checks.push({
      step: "cancel: revoke removes the invite",
      pass: rev.ok === true && afterRevoke === false,
      detail: `revoke=${JSON.stringify(rev)} · stillPresent=${afterRevoke}`,
    });
  } finally {
    // Safety net: ensure the synthetic row is gone even if an assertion threw.
    const cleaned = (await readKv()).filter((i) => i.email !== TEST_EMAIL);
    await writeKv(cleaned);
  }

  const allPass = checks.every((c) => c.pass);
  return NextResponse.json({ ok: allPass, checks });
}
