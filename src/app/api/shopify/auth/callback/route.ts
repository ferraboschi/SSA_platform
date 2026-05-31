// Shopify OAuth callback — exchanges the temporary `code` for a permanent
// access token. Only reachable during the one-time setup flow; not exposed
// in production beyond localhost. After the exchange the token is printed to
// the server console so you can copy it into .env.local.

import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? "";
const SHOP = process.env.SHOPIFY_STORE_DOMAIN ?? "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:32px">
        <h2 style="color:red">Errore OAuth Shopify</h2>
        <p>${error}: ${searchParams.get("error_description") ?? ""}</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code || !shop) {
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:32px">
        <h2 style="color:red">Parametri mancanti</h2>
        <p>code: ${code ?? "mancante"} — shop: ${shop ?? "mancante"}</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Exchange code for access token.
  const tokenRes = await fetch(
    `https://${SHOP}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    },
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return new NextResponse(
      `<html><body style="font-family:system-ui;padding:32px">
        <h2 style="color:red">Errore durante lo scambio del token</h2>
        <pre>${body}</pre>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const data = (await tokenRes.json()) as { access_token?: string; scope?: string };
  const token = data.access_token;

  // Print to server console so it can be copied to .env.local.
  console.log("\n========================================");
  console.log("✅ SHOPIFY ACCESS TOKEN OTTENUTO!");
  console.log("Copia questa riga in .env.local:");
  console.log(`SHOPIFY_ADMIN_TOKEN=${token}`);
  console.log("========================================\n");

  return new NextResponse(
    `<html><body style="font-family:system-ui;padding:32px;max-width:600px;margin:0 auto">
      <h2 style="color:green">✅ Token ottenuto!</h2>
      <p>Copia questa riga e aggiungila al file <code>.env.local</code> del progetto:</p>
      <pre style="background:#f0f0f0;padding:16px;border-radius:8px;word-break:break-all;font-size:13px">SHOPIFY_ADMIN_TOKEN=${token}</pre>
      <p style="color:#666;font-size:13px">Scope autorizzati: <code>${data.scope ?? "—"}</code></p>
      <p style="color:#666;font-size:13px">
        Dopo aver copiato il token in <code>.env.local</code>, riavvia il dev server
        e poi dimmi "fatto" nella chat con Claude.
      </p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
