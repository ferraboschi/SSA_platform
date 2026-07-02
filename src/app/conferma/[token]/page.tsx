// Public, tokenized "confirm your details" page — reachable WITHOUT app login.
//
// The link is a signed, expiring confirm token (src/lib/attendee/confirm-token.ts)
// bound to one attendee on one course. We verify it, load the subject via the
// service client (anon is blocked by RLS), and let the student confirm/correct
// their email — the course-start sanitization step.
import type { Metadata } from "next";
import { verifyConfirmToken } from "@/lib/attendee/confirm-token";
import { loadConfirmSubject } from "@/lib/attendee/confirm";
import { ConfirmForm } from "@/components/conferma/ConfirmForm";
import "@/components/esame-pubblico/exam-public.css";

export const metadata: Metadata = {
  title: "SSA · Conferma i tuoi dati",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const res = verifyConfirmToken(token);
  if (!res.ok) return <Invalid />;

  const subject = await loadConfirmSubject(res.payload.c, res.payload.k, res.payload.i);
  if (!subject) return <Invalid />;

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card" style={{ maxWidth: 460 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--indigo-600, #4f46e5)",
            marginBottom: 14,
          }}
        >
          Sake Sommelier Association
        </div>
        <ConfirmForm
          token={token}
          name={subject.fullName}
          phone={subject.phone}
          email={subject.email}
          deliveryAddress={subject.deliveryAddress}
          courseName={subject.courseName}
          alreadyConfirmed={subject.confirmed}
        />
      </div>
    </div>
  );
}

function Invalid() {
  return (
    <div className="exam-public-shell">
      <div className="exam-public-card" style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⌛</div>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Link non valido o scaduto</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-3, #6b7280)", margin: 0, lineHeight: 1.55 }}>
          Chiedi alla segreteria o al tuo educator di reinviarti il link di conferma.
        </p>
      </div>
    </div>
  );
}
