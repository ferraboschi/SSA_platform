"use client";

import { useId, useState } from "react";
import { confirmAttendeeAction } from "@/lib/attendee/confirm-actions";
import { GoogleAddressInput } from "@/components/address/AddressInput";

/**
 * Public "confirm your details" form. ALL fields are mandatory:
 *  • name — read-only (the enrolled identity);
 *  • email — LOCKED when the link arrived BY EMAIL (delivery proved the inbox);
 *    editable when the link was handed over via WhatsApp/SMS/copy;
 *  • phone — editable, propagates everywhere the number appears;
 *  • delivery address — Google Places autocomplete when the key is set, plus an
 *    explicit written confirmation checkbox;
 *  • delivery notes — FREE, optional (citofono name if different, courier
 *    instructions).
 * On success the educator sees a green tick for this attendee.
 */
export function ConfirmForm({
  token,
  name,
  phone: initialPhone,
  email: initialEmail,
  emailLocked,
  deliveryAddress: initialAddress,
  deliveryNotes: initialNotes,
  courseName,
  alreadyConfirmed,
}: {
  token: string;
  name: string;
  phone: string;
  email: string;
  emailLocked: boolean;
  deliveryAddress: string;
  deliveryNotes: string;
  courseName: string;
  alreadyConfirmed: boolean;
}) {
  const uid = useId();
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [address, setAddress] = useState(initialAddress);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete =
    Boolean(email.trim()) && Boolean(phone.trim()) && Boolean(address.trim()) && addressConfirmed;

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await confirmAttendeeAction(token, {
      email,
      phone,
      deliveryAddress: address,
      addressConfirmed,
      deliveryNotes: notes,
    });
    setBusy(false);
    if (res.ok) {
      setAddressSaved(res.addressSaved !== false);
      setDone(true);
    } else setError(res.error ?? "Qualcosa è andato storto.");
  };

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
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
        <h2 style={{ fontSize: 18, margin: "0 0 6px" }}>Dati confermati</h2>
        <p style={{ fontSize: 13.5, color: "var(--text-3)", margin: 0, lineHeight: 1.55 }}>
          Grazie{name ? `, ${name.split(" ")[0]}` : ""}. Riceverai i test e l&apos;esame
          all&apos;indirizzo <strong>{email}</strong>.
        </p>
        {addressSaved && address.trim() && (
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Spediremo eventuali materiali a: <strong>{address.trim()}</strong>
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "clamp(19px, 4vw, 23px)", margin: "0 0 4px" }}>Conferma i tuoi dati</h1>
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Corso <strong>{courseName}</strong>. Controlla e completa i tuoi dati:
        servono per i test, l&apos;esame e l&apos;eventuale spedizione di materiali.
        Tutti i campi sono obbligatori, tranne le note per la consegna.
      </p>

      <Field label="Nome e cognome" htmlFor={`${uid}-nome`}>
        <input id={`${uid}-nome`} className="input" value={name} readOnly style={ro} />
      </Field>

      <Field label="Email" htmlFor={`${uid}-email`}>
        <input
          id={`${uid}-email`}
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          readOnly={emailLocked}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@esempio.it"
          style={emailLocked ? ro : field}
        />
        {emailLocked && (
          <Hint>Hai ricevuto questo link proprio a questo indirizzo: è verificato.</Hint>
        )}
      </Field>

      <Field label="Telefono" htmlFor={`${uid}-tel`}>
        <input
          id={`${uid}-tel`}
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+39 …"
          maxLength={40}
          style={field}
        />
      </Field>

      <Field label="Indirizzo di consegna" htmlFor={`${uid}-addr`}>
        <GoogleAddressInput
          id={`${uid}-addr`}
          value={address}
          onChange={(v) => {
            setAddress(v);
            setAddressConfirmed(false); // a changed address must be re-confirmed
          }}
          className="input"
          textareaClassName="input"
          placeholder="Via, numero civico, CAP, città"
        />
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 8,
            fontSize: 12.5,
            color: "var(--text-2)",
            lineHeight: 1.45,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={addressConfirmed}
            onChange={(e) => setAddressConfirmed(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--indigo-600)", flexShrink: 0 }}
          />
          <span>
            Confermo di abitare all&apos;indirizzo indicato
            {address.trim() ? (
              <>
                : <strong>{address.trim()}</strong>
              </>
            ) : null}
          </span>
        </label>
      </Field>

      <Field label="Note per la consegna (facoltative)" htmlFor={`${uid}-note`}>
        <textarea
          id={`${uid}-note`}
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Es. nome sul citofono se diverso dal cognome, piano, altre indicazioni per il corriere"
          maxLength={200}
          rows={2}
          style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>

      {alreadyConfirmed && !error && (
        <p style={{ fontSize: 12, color: "var(--text-4)", margin: "0 0 10px" }}>
          Avevi già confermato — puoi aggiornare i dati se serve.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 12.5, color: "var(--danger-fg)", margin: "0 0 10px" }} role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !complete}
        style={{
          width: "100%",
          padding: "13px 16px",
          fontSize: 15,
          fontWeight: 600,
          borderRadius: 10,
          border: "none",
          background: busy || !complete ? "var(--border-2)" : "var(--indigo-600)",
          color: busy || !complete ? "var(--text-4)" : "#fff",
          cursor: busy || !complete ? "default" : "pointer",
        }}
      >
        {busy ? "Salvataggio…" : "Conferma i miei dati"}
      </button>
      {!complete && (
        <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "8px 0 0", textAlign: "center" }}>
          Compila tutti i campi e conferma l&apos;indirizzo per proseguire.
        </p>
      )}
    </div>
  );
}

const ro: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  fontSize: 15,
  background: "var(--surface-2)",
  color: "var(--text-2)",
};
const field: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  fontSize: 15,
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: "block",
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--text-3)",
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

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: "var(--text-4)", margin: "4px 0 0" }}>{children}</p>
  );
}
