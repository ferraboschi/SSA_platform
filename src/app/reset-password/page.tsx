// Password-reset landing. The reset email links here with a `?code=` that we
// exchange for a short-lived recovery session, then the user sets a new
// password. Public route (outside the (app) auth gate).
import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "SSA · Reimposta password",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error_description?: string }>;
}) {
  const { error_description } = await searchParams;

  // The recovery session was already established by /auth/reset (the Route
  // Handler) which set the cookies — so we just need a live session here.
  let ready = false;
  try {
    const sb = await getSupabaseServerClient();
    const { data } = await sb.auth.getUser();
    ready = !!data.user;
  } catch {
    ready = false;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--surface-2)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "var(--sh-card)",
          padding: "32px clamp(20px, 6vw, 32px)",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, textAlign: "center" }}>
          SSA Platform
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", marginBottom: 24 }}>
          Reimposta la password
        </p>

        {ready ? (
          <ResetPasswordForm />
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.5, textAlign: "center" }}>
              {error_description ||
                "Questo link non è valido o è scaduto. Richiedi un nuovo link dalla pagina di accesso."}
            </p>
            <Link
              href="/login"
              style={{
                textAlign: "center",
                padding: "11px 14px",
                borderRadius: 8,
                background: "var(--indigo-600)",
                color: "white",
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Torna al login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
