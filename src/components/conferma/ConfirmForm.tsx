"use client";

import { useId, useState } from "react";
import { confirmAttendeeAction } from "@/lib/attendee/confirm-actions";
import { GoogleAddressInput, type AddressPlaceMeta } from "@/components/address/AddressInput";
import { addressHasCivico } from "@/lib/attendee/civico";

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
  const initialPhoneParts = splitPhone(initialPhone);
  const [fullName, setFullName] = useState(name);
  const [email, setEmail] = useState(initialEmail);
  const [dialCode, setDialCode] = useState(initialPhoneParts.code);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneParts.number);
  const [address, setAddress] = useState(initialAddress);
  // Street-number detection (owner batch 7): Google tells us whether the
  // selected address carries a civic number; null = typed by hand / unknown.
  const [placeMeta, setPlaceMeta] = useState<AddressPlaceMeta | null>(null);
  const [civico, setCivico] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = phoneNumber.trim() ? `${dialCode} ${phoneNumber.trim()}` : "";
  // The civic number is REAL, not self-certified: Google's street_number
  // component when a suggestion was picked, else a STRICT street-segment
  // heuristic (postal codes never count — the owner's field test caught the
  // old any-digit check passing addresses without a number). On top, the
  // explicit confirmation checkbox is back as the final attestation.
  const civicoDetected = placeMeta?.hasStreetNumber === true || addressHasCivico(address);
  const civicoOk = civicoDetected || Boolean(civico.trim());
  const complete =
    Boolean(fullName.trim()) &&
    Boolean(email.trim()) &&
    Boolean(phoneNumber.trim()) &&
    Boolean(address.trim()) &&
    civicoOk &&
    addressConfirmed &&
    dataConfirmed &&
    consentAccepted;

  // Compose the civic number INTO the street segment ("V. del Corso, Roma" +
  // 12 → "V. del Corso 12, Roma") so the courier gets one canonical line.
  const composedAddress = (() => {
    const a = address.trim();
    if (civicoDetected || !civico.trim()) return a;
    const cut = a.indexOf(",");
    return cut === -1 ? `${a} ${civico.trim()}` : `${a.slice(0, cut)} ${civico.trim()}${a.slice(cut)}`;
  })();

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
      deliveryAddress: composedAddress,
      addressConfirmed: civicoOk && addressConfirmed,
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
        {addressSaved && address.trim() && (
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Spediremo eventuali materiali a: <strong>{address.trim()}</strong>
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
            {COUNTRIES.map((c) => (
              <option key={c.code + c.name} value={c.code}>
                {c.flag} {c.code}
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

      <Field label="Indirizzo di consegna" htmlFor={`${uid}-addr`}>
        <GoogleAddressInput
          id={`${uid}-addr`}
          value={address}
          onChange={setAddress}
          onPlaceMeta={setPlaceMeta}
          className="input"
          textareaClassName="input"
          placeholder="Via, numero civico, CAP, città"
        />
        {address.trim() !== "" &&
          (civicoDetected ? (
            <div
              style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--success-fg)",
              }}
            >
              ✓ Numero civico rilevato
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12.5, color: "var(--warning-fg)", fontWeight: 600, marginBottom: 6 }}>
                ✕ Numero civico non rilevato — aggiungilo qui sotto, ci serve per la consegna del materiale.
              </div>
              <input
                className="input"
                type="text"
                value={civico}
                onChange={(e) => setCivico(e.target.value)}
                placeholder="Numero civico (es. 12, 12/B — se assente scrivi SNC)"
                maxLength={12}
                style={{ maxWidth: 320 }}
              />
            </div>
          ))}
        <Check checked={addressConfirmed} onChange={setAddressConfirmed} style={{ marginTop: 8 }}>
          Confermo che l&apos;indirizzo è completo di numero civico
        </Check>
      </Field>

      <Field label="Note per la consegna (facoltative)" htmlFor={`${uid}-note`}>
        <textarea
          id={`${uid}-note`}
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Es. nome sul citofono se diverso dal cognome, piano, altre indicazioni per il corriere"
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
        </p>
      )}
    </div>
  );
}

// Official SSA legal pages (Shopify-hosted policy pages on the SSA domain).
const PRIVACY_URL = "https://www.sakesommelierassociation.it/policies/privacy-policy";
const TERMS_URL = "https://www.sakesommelierassociation.it/policies/terms-of-service";

// International dial codes for the phone field. Italy is the default (the vast
// majority of attendees); the rest cover the common origins. Order = Italy +
// neighbours first, then broader.
const COUNTRIES: { code: string; flag: string; name: string }[] = [
  { code: "+39", flag: "🇮🇹", name: "Italia" },
  { code: "+41", flag: "🇨🇭", name: "Svizzera" },
  { code: "+378", flag: "🇸🇲", name: "San Marino" },
  { code: "+33", flag: "🇫🇷", name: "Francia" },
  { code: "+49", flag: "🇩🇪", name: "Germania" },
  { code: "+44", flag: "🇬🇧", name: "Regno Unito" },
  { code: "+34", flag: "🇪🇸", name: "Spagna" },
  { code: "+43", flag: "🇦🇹", name: "Austria" },
  { code: "+32", flag: "🇧🇪", name: "Belgio" },
  { code: "+31", flag: "🇳🇱", name: "Paesi Bassi" },
  { code: "+351", flag: "🇵🇹", name: "Portogallo" },
  { code: "+30", flag: "🇬🇷", name: "Grecia" },
  { code: "+353", flag: "🇮🇪", name: "Irlanda" },
  { code: "+352", flag: "🇱🇺", name: "Lussemburgo" },
  { code: "+386", flag: "🇸🇮", name: "Slovenia" },
  { code: "+385", flag: "🇭🇷", name: "Croazia" },
  { code: "+420", flag: "🇨🇿", name: "Rep. Ceca" },
  { code: "+48", flag: "🇵🇱", name: "Polonia" },
  { code: "+46", flag: "🇸🇪", name: "Svezia" },
  { code: "+45", flag: "🇩🇰", name: "Danimarca" },
  { code: "+47", flag: "🇳🇴", name: "Norvegia" },
  { code: "+1", flag: "🇺🇸", name: "USA / Canada" },
  { code: "+81", flag: "🇯🇵", name: "Giappone" },
  { code: "+86", flag: "🇨🇳", name: "Cina" },
  { code: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "+971", flag: "🇦🇪", name: "Emirati Arabi" },
];

/** Split a stored phone into a known dial code + the rest. Defaults to Italy
 *  (+39) when there's no recognizable prefix, so the local number stays intact. */
function splitPhone(raw: string): { code: string; number: string } {
  const s = (raw || "").trim();
  if (s.startsWith("+")) {
    // Longest match wins so "+378"/"+351" beat "+3…".
    const codes = COUNTRIES.map((c) => c.code).sort((a, b) => b.length - a.length);
    const match = codes.find((c) => s.startsWith(c));
    if (match) return { code: match, number: s.slice(match.length).trim() };
  }
  return { code: "+39", number: s };
}

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
