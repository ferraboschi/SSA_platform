// Staff invite landing. The invite email links here with our own non-expiring
// token (see inviteStaffAction). Token-gated; public route (outside the (app)
// auth gate). The person sets a password and is signed in.
import type { Metadata } from "next";
import Link from "next/link";
import { getInviteByTokenAction } from "@/lib/auth/supabase-actions";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const metadata: Metadata = {
  title: "SSA · Attiva il tuo account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInviteByTokenAction(token);

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

        {!invite ? (
          <>
            <p style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", marginBottom: 20 }}>
              Attiva il tuo account
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.5, textAlign: "center" }}>
                Questo link non è valido o è stato revocato. Chiedi
                all’amministratore di reinviarti l’invito.
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
                Vai al login
              </Link>
            </div>
          </>
        ) : invite.accepted ? (
          <>
            <p style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", marginBottom: 20 }}>
              Account già attivo
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.5, textAlign: "center" }}>
                Hai già impostato la password. Accedi dalla pagina di login (o usa
                “Password dimenticata?” se non la ricordi).
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
                Vai al login
              </Link>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--text-2)", textAlign: "center", marginBottom: 6 }}>
              {invite.firstName ? `Ciao ${invite.firstName}, ` : ""}attiva il tuo
              account
            </p>
            <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", marginBottom: 22, lineHeight: 1.5 }}>
              Inserisci l’email a cui hai ricevuto l’invito e scegli una password.
            </p>
            <AcceptInviteForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
