import { NextResponse } from "next/server";
import { getEmailService } from "@/lib/integrations/email";
import { resendConfig } from "@/lib/integrations/config";
import { hasRole } from "@/lib/auth/guard";

// Gated diagnostic: sends a single CLEARLY-LABELLED test email through the real
// email pipe (Resend in prod) to confirm end-to-end deliverability from the
// verified sending domain. Does NOT create or modify any user/profile — safe to
// run against a recipient who already has an account. Authorize via an ADMIN
// session OR the SYNC_SECRET query param — never public.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const to = url.searchParams.get("to");
  const bySecret = Boolean(process.env.SYNC_SECRET) && secret === process.env.SYNC_SECRET;
  const byAdmin = await hasRole(["admin"]).catch(() => false);
  if (!bySecret && !byAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!to || !to.includes("@")) {
    return NextResponse.json({ ok: false, error: "missing/invalid ?to=" }, { status: 400 });
  }

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5">Sake Sommelier Association</div>
    <h2 style="font-size:18px;margin:8px 0 14px">Email di prova ✅</h2>
    <p style="font-size:14px;line-height:1.5">Questa è un'email di verifica del sistema di notifiche della piattaforma SSA. Se la stai leggendo, la consegna funziona correttamente. Nessuna azione richiesta.</p>
    <p style="font-size:11px;color:#9ca3af;margin-top:20px">Email automatica di test · piattaforma SSA</p>
  </div>`;

  try {
    const res = await getEmailService().send({
      to,
      subject: "Email di prova — piattaforma SSA",
      html,
      tag: "email-test",
    });
    return NextResponse.json({
      ok: true,
      status: res.status,
      id: res.id,
      provider: res.provider,
      from: resendConfig.from,
      to,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      from: resendConfig.from,
      to,
    });
  }
}
