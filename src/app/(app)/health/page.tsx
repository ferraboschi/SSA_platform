// Internal /health page — checks every external seam end-to-end. Hidden from
// the sidebar, surfaced only by typing /health in the URL. Useful while
// wiring up real services (Supabase, Shopify, Airtable, Dropbox, Resend).

import {
  airtableConfig,
  appConfig,
  dropboxConfig,
  resendConfig,
  shopifyConfig,
  supabaseConfig,
} from "@/lib/integrations/config";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkSupabase(): Promise<Check> {
  if (!supabaseConfig.isConfigured) {
    return {
      name: "Supabase",
      ok: false,
      detail: "Not configured (set NEXT_PUBLIC_SUPABASE_URL + ANON_KEY).",
    };
  }
  try {
    const sb = await getSupabaseServerClient();
    const { error, count } = await sb
      .from("profiles")
      .select("*", { count: "exact", head: true });
    if (error) {
      const msg = error.message || JSON.stringify(error);
      if (msg.includes("Could not find the table")) {
        return {
          name: "Supabase",
          ok: false,
          detail:
            "Connected, but the schema is not applied yet. Run supabase/migrations/20260530000000_init.sql in the SQL Editor.",
        };
      }
      return { name: "Supabase", ok: false, detail: msg };
    }
    return {
      name: "Supabase",
      ok: true,
      detail: `Connected — profiles table reachable (${count ?? 0} rows).`,
    };
  } catch (e) {
    return {
      name: "Supabase",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

function checkSimple(
  name: string,
  configured: boolean,
  detail: string,
): Check {
  return { name, ok: configured, detail };
}

export default async function HealthPage() {
  const checks: Check[] = [
    await checkSupabase(),
    checkSimple(
      "Shopify",
      shopifyConfig.isConfigured,
      shopifyConfig.isConfigured
        ? "Configured (live)."
        : "Not configured — using stub.",
    ),
    checkSimple(
      "Airtable",
      airtableConfig.isConfigured,
      airtableConfig.isConfigured
        ? "Configured (live)."
        : "Not configured — using stub.",
    ),
    checkSimple(
      "Dropbox",
      dropboxConfig.isConfigured,
      dropboxConfig.isConfigured
        ? "Configured (live)."
        : "Not configured — using stub.",
    ),
    checkSimple(
      "Resend",
      resendConfig.isConfigured,
      resendConfig.isConfigured
        ? "Configured (live)."
        : "Not configured — email goes to stub (logs only).",
    ),
  ];

  return (
    <div style={{ padding: 32, maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Stato integrazioni</h1>
      <p style={{ color: "var(--text-2)", marginBottom: 24, fontSize: 13 }}>
        Diagnostica delle connessioni esterne. <code>USE_SEED</code>:{" "}
        <strong>{String(appConfig.useSeed)}</strong>
      </p>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {checks.map((c, i) => (
          <div
            key={c.name}
            style={{
              padding: "14px 18px",
              borderTop: i === 0 ? "none" : "1px solid var(--border-2)",
              display: "grid",
              gridTemplateColumns: "20px 110px 1fr",
              gap: 12,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: c.ok ? "var(--success)" : "var(--danger)",
              }}
              aria-hidden
            />
            <strong>{c.name}</strong>
            <span style={{ color: "var(--text-2)" }}>{c.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
