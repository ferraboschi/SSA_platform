"use client";

import { useId, useState } from "react";
import { confirmAttendeeAction } from "@/lib/attendee/confirm-actions";
import { StructuredAddressInput } from "@/components/address/StructuredAddressInput";
import {
  EMPTY_DELIVERY_PARTS,
  composeDeliveryLine,
  normalizeDeliveryParts,
  partsFromLegacyLine,
  validateDeliveryParts,
  type DeliveryAddressParts,
} from "@/lib/attendee/delivery-address";
import { COUNTRY_CODES, splitPhone } from "@/lib/phone/dial-codes";

/**
 * Public "confirm your details" form. ALL fields are mandatory:
 *  • name — read-only (the enrolled identity);
 *  • email — LOCKED when the link arrived BY EMAIL (delivery proved the inbox);
 *    editable when the link was handed over via WhatsApp/SMS/copy;
 *  • phone — editable, propagates everywhere the number appears;
 *  • delivery address — STRUCTURED (street, civic number, CAP, city, province,
 *    country: every part mandatory), Google Places suggestions when the key is
 *    set, plus an explicit written confirmation checkbox;
 *  • delivery notes — FREE, optional (citofono name if different from the
 *    surname, courier instructions).
 * On success the educator sees a green tick for this attendee.
 */
export function ConfirmForm({
  token,
  name,
  phone: initialPhone,
  email: initialEmail,
  emailLocked,
  deliveryAddress: initialAddress,
  deliveryParts: initialParts,
  deliveryNotes: initialNotes,
  courseName,
  alreadyConfirmed,
}: {
  token: string;
  name: string;
  phone: string;
  email: string;
  emailLocked: boolean;
  /** Previously saved one-line address (legacy prefill when no parts exist). */
  deliveryAddress: string;
  /** Previously saved structured parts, when the column exists and was filled. */
  deliveryParts: DeliveryAddressParts | null;
  deliveryNotes: string;
  courseName: string;
  alreadyConfirmed: boolean;
}) {
  const uid = useId();
  const initialPhoneParts = splitPhone(initialPhone); // { code, num }
  const [fullName, setFullName] = useState(name);
  const [email, setEmail] = useState(initialEmail);
  const [dialCode, setDialCode] = useState(initialPhoneParts.code);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneParts.num);
  // Structured address: saved parts win; a legacy one-line address is split
  // best-effort so a returning student finds the fields pre-filled.
  const [parts, setParts] = useState<DeliveryAddressParts>(() =>
    initialParts
      ? normalizeDeliveryParts(initialParts)
      : initialAddress.trim()
        ? normalizeDeliveryParts({ ...EMPTY_DELIVERY_PARTS, ...partsFromLegacyLine(initialAddress) })
        : EMPTY_DELIVERY_PARTS,
  );
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = phoneNumber.trim() ? `${dialCode} ${phoneNumber.trim()}` : "";
  // Same pure validation the server runs: EVERY address part is mandatory
  // (owner rule 25/9/2026 — the old check only looked for a civic number).
  const normalizedParts = normalizeDeliveryParts(parts);
  const partsErrors = validateDeliveryParts(normalizedParts);
  const addressOk = Object.keys(partsErrors).length === 0;
  const complete =
    Boolean(fullName.trim()) &&
    Boolean(email.trim()) &&
    Boolean(phoneNumber.trim()) &&
    addressOk &&
    addressConfirmed &&
    dataConfirmed &&
    consentAccepted;
  const composedAddress = addressOk ? composeDeliveryLine(normalizedParts) : "";

  // On mobile the on-screen keyboard covers the lower half — bring the focused
  // field into view (after a short delay so the keyboard has appeared). Captured
  // at the form level so it works for every field, including the address box.
  const onFieldFocus = (e: React.FocusEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    if (!el.matches("input:not([type=checkbox]), textarea, select")) return;
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await confirmAttendeeAction(token, {
      name: fullName,
      email,
      phone: fullPhone,
      deliveryParts: normalizedParts,
      addressConfirmed: addressOk && addressConfirmed,
      dataConfirmed,
      privacyConsent: consentAccepted,
      termsAccepted: consentAccepted,
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
          Grazie{fullName ? `, ${fullName.split(" ")[0]}` : ""}. Riceverai i test e l&apos;esame
          all&apos;indirizzo <strong>{email}</strong>.
        </p>
        {addressSaved && composedAddress && (
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Spediremo eventuali materiali a: <strong>{composedAddress}</strong>
          </p>
        )}
      </div>
    );
  }

  return (
    <div onFocusCapture={onFieldFocus}>
      <h1 style={{ fontSize: "clamp(19px, 4vw, 23px)", margin: "0 0 4px" }}>Conferma i tuoi dati</h1>
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 18px", lineHeight: 1.5 }}>
        Corso <strong>{courseName}</strong>. Controlla e completa i tuoi dati:
        servono per i test, l&apos;esame e l&apos;eventuale spedizione di materiali.
        Tutti i campi sono obbligatori, tranne le note per la consegna.
      </p>

      <Field label="Nome e cognome" htmlFor={`${uid}-nome`}>
        <input
          id={`${uid}-nome`}
          className="input"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nome e cognome"
          maxLength={120}
          style={field}
        />
        <Hint>Correggi qui eventuali errori di battitura nel tuo nome.</Hint>
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
        <div style={{ display: "flex", gap: 8 }}>
          <select
            aria-label="Prefisso internazionale"
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            style={{ ...field, width: "auto", flex: "0 0 auto", maxWidth: 150 }}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.c + c.n} value={c.c}>
                {c.f} {c.c}
              </option>
            ))}
          </select>
          <input
            id={`${uid}-tel`}
            className="input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="333 1234567"
            maxLength={30}
            style={{ ...field, flex: 1, minWidth: 0 }}
          />
        </div>
      </Field>

      <Field label="Indirizzo di consegna" htmlFor={`${uid}-addr-street`}>
        <StructuredAddressInput
          idPrefix={`${uid}-addr`}
          value={parts}
          onChange={setParts}
          errors={partsErrors}
          inputClassName="input"
        />
        <Hint>Tutti i campi dell&apos;indirizzo sono obbligatori: via, numero civico, CAP, città, provincia e paese.</Hint>
        <Check checked={addressConfirmed} onChange={setAddressConfirmed} style={{ marginTop: 8 }}>
          Confermo che l&apos;indirizzo di consegna è completo e corretto
        </Check>
      </Field>

      <Field label="Nome sul citofono e note per il corriere (facoltativo)" htmlFor={`${uid}-note`}>
        <textarea
          id={`${uid}-note`}
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nome sul citofono se diverso dal tuo cognome, piano, scala, altre indicazioni per il corriere"
          maxLength={200}
          rows={4}
          style={{ ...field, minHeight: 104, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
        />
      </Field>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          margin: "4px 0 16px",
          padding: "12px 14px",
          borderRadius: 10,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Check checked={dataConfirmed} onChange={setDataConfirmed}>
          Ho controllato e confermo la correttezza di queste informazioni
        </Check>
        <Check checked={consentAccepted} onChange={setConsentAccepted}>
          Ho letto e accetto la{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={link}>
            Privacy Policy
          </a>{" "}
          e i{" "}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={link}>
            Termini e Condizioni
          </a>
        </Check>
      </div>

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
          {!addressOk && ` Indirizzo: ${Object.values(partsErrors).join(" ")}`}
        </p>
      )}
    </div>
  );
}

// Official SSA legal pages (Shopify-hosted policy pages on the SSA domain).
const PRIVACY_URL = "https://www.sakesommelierassociation.it/policies/privacy-policy";
const TERMS_URL = "https://www.sakesommelierassociation.it/policies/terms-of-service";

const link: React.CSSProperties = {
  color: "var(--indigo-600)",
  fontWeight: 600,
  textDecoration: "underline",
};

/** A left-aligned checkbox + wrapping label, used for every confirmation flag. */
function Check({
  checked,
  onChange,
  children,
  style,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        fontSize: 12.5,
        color: "var(--text-2)",
        lineHeight: 1.45,
        cursor: "pointer",
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--indigo-600)", flexShrink: 0 }}
      />
      <span>{children}</span>
    </label>
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
