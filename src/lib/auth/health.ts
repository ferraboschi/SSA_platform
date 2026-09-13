import "server-only";

// Access-security health for the dashboard's "Salute sistema" card.
//
// Two things that silently make the platform breakable and that nobody would
// otherwise notice until an incident:
//  • Supabase self-signup left ON: GoTrue's public /auth/v1/signup mints an auth
//    user with the anon key that ships in the client bundle, and the profiles
//    trigger gives it a role — the platform itself never signs anyone up.
//  • The link-signing secrets (exam/share tokens) missing on the host: the
//    signers then fall back to SYNC_SECRET (a bearer secret that travels in
//    query strings) or to a public dev constant → forgeable student links.

import { unstable_cache } from "next/cache";
import { supabaseConfig } from "@/lib/integrations/config";

export const AUTH_HEALTH_TAG = "auth-health";

export interface AuthHealth {
  /** true = anyone can register; null = could not be read. */
  signupOpen: boolean | null;
  examLinkSecret: boolean;
  shareLinkSecret: boolean;
  checkedAt: string;
}

async function readSignupOpen(): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !supabaseConfig.isConfigured) return null;
  try {
    // Public, read-only endpoint (the same one the auth SDK reads); the anon key
    // is a public identifier, never a secret.
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: anon },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { disable_signup?: boolean };
    return typeof body.disable_signup === "boolean" ? !body.disable_signup : null;
  } catch {
    return null;
  }
}

async function computeAuthHealth(): Promise<AuthHealth> {
  return {
    signupOpen: await readSignupOpen(),
    examLinkSecret: Boolean(process.env.EXAM_LINK_SECRET),
    shareLinkSecret: Boolean(process.env.SHARE_LINK_SECRET),
    checkedAt: new Date().toISOString(),
  };
}

/** Cached 10': the signup flag changes only when the owner flips it. */
export async function getAuthHealth(): Promise<AuthHealth> {
  const cached = unstable_cache(computeAuthHealth, ["auth-health-v1"], {
    revalidate: 600,
    tags: [AUTH_HEALTH_TAG],
  });
  return cached();
}
