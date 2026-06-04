import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/integrations/config";

// Public, secret-free health check: reports which integrations have credentials
// configured (booleans only — never the values). Useful to verify env wiring.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    ...getConnectionStatus(),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    googleMaps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    resend: Boolean(process.env.RESEND_API_KEY),
  });
}
