// Sake Company Shopify OAuth callback — exchanges the temporary `code` for a
// PERMANENT offline access token (Shopify offline tokens never expire). One-time
// setup flow: after authorizing the app, the token is shown so it can be copied
// into .env.local as SAKECOMPANY_ADMIN_TOKEN.
import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = process.env.SAKECOMPANY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SAKECOMPANY_CLIENT_SECRET ?? "";

/** Escape attacker-controllable query values before embedding into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, color: string, body: string) {
  return new NextResponse(
    `<html><body style="font-family:system-ui;padding:32px;max-width:640px;margin:0 auto">
      <h2 style="color:${color}">${title}</h2>${body}
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const error = searchParams.get("error");

  if (error) {
    return page("Errore OAuth Shopify", "red", `<p>${esc(error)}: ${esc(searchParams.get("error_description") ?? "")}</p>`);
  }
  if (!code || !shop) {
    return page("Parametri mancanti", "red", `<p>code: ${esc(code ?? "mancante")} — shop: ${esc(shop ?? "mancante")}</p>`);
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return page(
      "Config mancante",
      "red",
      `<p>Imposta <code>SAKECOMPANY_CLIENT_ID</code> e <code>SAKECOMPANY_CLIENT_SECRET</code> in <code>.env.local</code> e riavvia il dev server.</p>`,
    );
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  });

  if (!tokenRes.ok) {
    const b = await tokenRes.text();
    return page("Errore durante lo scambio del token", "red", `<pre>${esc(b)}</pre>`);
  }

  const data = (await tokenRes.json()) as { access_token?: string; scope?: string };
  const token = data.access_token;

  console.log("\n========================================");
  console.log("✅ SAKE COMPANY ACCESS TOKEN OTTENUTO!");
  console.log(`SAKECOMPANY_STORE_DOMAIN=${shop}`);
  console.log(`SAKECOMPANY_ADMIN_TOKEN=${token}`);
  console.log("========================================\n");

  return page(
    "✅ Token Sake Company ottenuto!",
    "green",
    `<p>Aggiungi queste righe al file <code>.env.local</code>:</p>
     <pre style="background:#f0f0f0;padding:16px;border-radius:8px;word-break:break-all;font-size:13px">SAKECOMPANY_STORE_DOMAIN=${shop}
SAKECOMPANY_ADMIN_TOKEN=${token}</pre>
     <p style="color:#666;font-size:13px">Scope: <code>${data.scope ?? "—"}</code></p>
     <p style="color:#666;font-size:13px">Questo token è <strong>permanente</strong> (non scade). Poi dimmi "fatto" nella chat.</p>`,
  );
}
