// Public, tokenized "confirm your details" page — reachable WITHOUT app login.
//
// The link is a signed, expiring confirm token (src/lib/attendee/confirm-token.ts)
// bound to one attendee on one course. We verify it, load the subject via the
// service client (anon is blocked by RLS), and let the student confirm/correct
// their email — the course-start sanitization step.
import type { Metadata } from "next";
import { verifyConfirmToken, isConfirmLinkSpent } from "@/lib/attendee/confirm-token";
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

  // SPENT LINK: once the attendee has confirmed, links issued before that
  // moment are closed — only a deliberate re-send re-opens the form.
  if (isConfirmLinkSpent(subject.confirmedAt, res.payload.ia)) {
    return (
      <div className="exam-public-shell">
        <div className="exam-public-card" style={{ textAlign: "center", maxWidth: 440 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--success-bg)",
              color: "var(--success-fg)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 12px",
              fontSize: 26,
            }}
          >
            ✓
          </div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Dati già confermati</h1>
          <p style={{ fontSize: 13.5, color: "var(--text-3)", margin: 0, lineHeight: 1.55 }}>
            {subject.fullName ? `${subject.fullName.split(" ")[0]}, i` : "I"} tuoi dati per il corso{" "}
            <strong>{subject.courseName}</strong> risultano già confermati. Se devi correggerli,
            chiedi all&apos;educator di reinviarti un nuovo link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-public-shell">
      <div className="exam-public-card" style={{ maxWidth: 460 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--indigo-600)",
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
          // Delivered BY EMAIL → the address is proven by receipt → locked.
          emailLocked={res.payload.ch === "email"}
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
        <p style={{ fontSize: 13.5, color: "var(--text-3)", margin: 0, lineHeight: 1.55 }}>
          Chiedi alla segreteria o al tuo educator di reinviarti il link di conferma.
        </p>
      </div>
    </div>
  );
}
