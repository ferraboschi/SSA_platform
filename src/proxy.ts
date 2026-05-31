// Next.js 16 Proxy (formerly Middleware) — runs before every request.
//
// Sole purpose: refresh Supabase's auth tokens before the request hits the
// route. Without this, the access token in the cookie expires after ~1 hour
// and server components can't read auth.getUser() reliably. See
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// Authorization itself (redirect-to-login etc.) lives in (app)/layout.tsx —
// the Next docs recommend keeping the Proxy thin and using layouts/route
// handlers for the heavy auth lifting.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Unconfigured (e.g. CI without env): pass through unchanged.
  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(updates) {
        for (const { name, value } of updates) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of updates) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Forces token refresh if the access token is near expiry. The result is
  // intentionally unused — we only care about the side-effect on cookies.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on everything EXCEPT static assets and Next internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
