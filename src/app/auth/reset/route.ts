// Auth landing for email links (password recovery + invites). A Route Handler
// can write Supabase's session cookies (a Server Component cannot), so the
// session persists before the user sets a new password on /reset-password.
//
// Prefers the `token_hash` flow (verifyOtp) which works from ANY browser — the
// PKCE `?code=` flow needs the code-verifier cookie from the SAME browser that
// requested the reset, which fails when the email opens elsewhere.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { appConfig } from "@/lib/integrations/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  // Use the PUBLIC base URL, never req.nextUrl.origin — behind Render's proxy
  // the request origin is the internal host (https://localhost:10000), which
  // would redirect the user's browser to a dead localhost address.
  const origin = appConfig.baseUrl.replace(/\/$/, "") || req.nextUrl.origin;
  // Where to land after a successful verify. Recovery/invite → set-password;
  // signup confirmation → login. Only same-origin relative paths are honored.
  const nextParam = params.get("next");
  const dest =
    nextParam && nextParam.startsWith("/") ? `${origin}${nextParam}` : `${origin}/reset-password`;
  const ok = dest;
  const fail = `${origin}/reset-password?error_description=${encodeURIComponent("Link non valido o scaduto.")}`;

  try {
    const sb = await getSupabaseServerClient();
    if (tokenHash && type) {
      const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
      return NextResponse.redirect(error ? fail : ok);
    }
    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      return NextResponse.redirect(error ? fail : ok);
    }
  } catch {
    /* fall through to the error redirect */
  }
  return NextResponse.redirect(fail);
}
