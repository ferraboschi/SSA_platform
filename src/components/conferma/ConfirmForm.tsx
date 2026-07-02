"use client";

import { useState } from "react";
import { confirmAttendeeAction } from "@/lib/attendee/confirm-actions";

/**
 * Public "confirm your details" form. Name + phone are shown read-only
 * (prefilled); the EMAIL is the field the student confirms/corrects — it becomes
 * the address that receives the day-tests + exam. On success the educator sees a
 * green tick for this attendee.
 */
export function ConfirmForm({
  token,
  name,
  phone,
  email: initialEmail,
  courseName,
  alreadyConfirmed,
}: {
  token: string;
  name: string;
  phone: string;
  email: string;
  courseName: string;
  alreadyConfirmed: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await confirmAttendeeAction(token, email);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? "Qualcosa è andato storto.");
  };

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "var(--green-50, #ecfdf5)",
            color: "var(--green-600, #059669)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 12px",
            fontSize: 26,
          }}
        >
          ✓
        </div>
        <h2 style={{ fontSize: 18, margin: "0 0 6px" }}>Dati confermati</h2>
        <p style={{ fontSize: 13.5, color: "var(--text-3, #6b7280)", margin: 0, lineHeight: 1.55 }}>
          Grazie{name ? `, ${name.split(" ")[0]}` : ""}. Riceverai i test e l&apos;esame
          all&apos;indirizzo <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "clamp(19px, 4vw, 23px)", margin: "0 0 4px" }}>Conferma i tuoi dati</h1>
      <p style={{ fontSize: 13, color: "var(--text-3, #6b7280)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Corso <strong>{courseName}</strong>. Controlla che l&apos;indirizzo email sia
        corretto: è quello a cui riceverai i mini-test e l&apos;esame finale.
      </p>

      <Field label="Nome e cognome">
        <input className="input" value={name} readOnly style={ro} />
      </Field>
      {phone && (
        <Field label="Telefono">
          <input className="input" value={phone} readOnly style={ro} />
        </Field>
      )}
      <Field label="Email">
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@esempio.it"
          style={{ width: "100%", padding: "9px 11px", fontSize: 14 }}
        />
      </Field>

      {alreadyConfirmed && !error && (
        <p style={{ fontSize: 12, color: "var(--text-4, #9ca3af)", margin: "0 0 10px" }}>
          Avevi già confermato — puoi aggiornare l&apos;email se serve.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 12.5, color: "var(--red-600, #dc2626)", margin: "0 0 10px" }}>{error}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !email.trim()}
        style={{
          width: "100%",
          padding: "11px 16px",
          fontSize: 14.5,
          fontWeight: 600,
          borderRadius: 9,
          border: "none",
          background: busy || !email.trim() ? "var(--surface-3, #e5e7eb)" : "var(--indigo-600, #4f46e5)",
          color: busy || !email.trim() ? "var(--text-4, #9ca3af)" : "#fff",
          cursor: busy || !email.trim() ? "default" : "pointer",
        }}
      >
        {busy ? "Salvataggio…" : "Conferma i miei dati"}
      </button>
    </div>
  );
}

const ro: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 14,
  background: "var(--surface-2, #f4f5f7)",
  color: "var(--text-2, #374151)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--text-3, #6b7280)",
          margin: "0 0 4px",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
