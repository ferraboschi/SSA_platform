// Password-reset code exchange. The reset email links here with `?code=`. A
// Route Handler (unlike a Server Component) CAN write Supabase's session
// cookies, so the recovery session persists to the browser before the user
// sets a new password on /reset-password.
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = req.nextUrl.origin;
  if (code) {
    try {
      const sb = await getSupabaseServerClient();
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}/reset-password`);
    } catch {
      /* fall through to the error redirect */
    }
  }
  return NextResponse.redirect(
    `${origin}/reset-password?error_description=${encodeURIComponent("Link non valido o scaduto.")}`,
  );
}
