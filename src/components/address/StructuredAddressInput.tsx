"use client";

// Structured delivery address for /conferma: street (with Google Places
// suggestions when the browser key is set), civic number, CAP, city, province,
// country — ALL mandatory (owner rule 25/9/2026; only the civic number was
// checked before, and hand-typed addresses arrived without CAP or city).
// A Google pick fills every field from the normalized components; the student
// can still correct any field by hand (provenance then becomes "manual").
// Validation lives in the PURE module delivery-address.ts, shared with the
// server action, so the form can never accept what the server refuses.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { COUNTRY_CODES } from "@/lib/phone/dial-codes";
import { hasGoogleMapsKey, loadGoogleMaps, type GMaps } from "./AddressInput";
import {
  isItaly,
  partsFromGooglePlace,
  type DeliveryAddressParts,
  type DeliveryPartsErrors,
} from "@/lib/attendee/delivery-address";

type PartKey = "street" | "number" | "postalCode" | "city" | "province" | "country";

export function StructuredAddressInput({
  value,
  onChange,
  errors,
  showErrors,
  idPrefix,
  inputClassName = "input",
  inputStyle,
}: {
  value: DeliveryAddressParts;
  onChange: (next: DeliveryAddressParts) => void;
  /** Field errors from validateDeliveryParts (empty = complete). */
  errors: DeliveryPartsErrors;
  /** Show every error (e.g. after a submit attempt), not only touched fields. */
  showErrors?: boolean;
  idPrefix: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
}) {
  const streetRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const [google, setGoogle] = useState<"loading" | "ready" | "off">(hasGoogleMapsKey ? "loading" : "off");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Bind Places ONCE to the street input. The listener reads the latest
  // onChange through a ref so a re-render never re-binds the widget.
  useEffect(() => {
    if (!hasGoogleMapsKey) return;
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !streetRef.current) return;
        const w = window as unknown as { google?: GMaps };
        if (!w.google) throw new Error("no google");
        const ac = new w.google.maps.places.Autocomplete(streetRef.current, {
          types: ["address"],
          fields: ["address_components", "formatted_address", "place_id"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const comps = place.address_components ?? [];
          if (comps.length === 0) return; // Enter without a pick → keep the typed text
          onChangeRef.current(partsFromGooglePlace(comps, place.formatted_address, place.place_id));
        });
        setGoogle("ready");
      })
      .catch(() => {
        if (!cancelled) setGoogle("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (k: PartKey, v: string) => {
    // A hand edit after a Google pick: the parts no longer come from Google, and
    // the ISO code follows the country TEXT from now on (never a stale "IT").
    onChange({ ...value, [k]: v, source: "manual", placeId: undefined, formatted: undefined, countryCode: undefined });
  };
  const touch = (k: PartKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const err = (k: PartKey) => (showErrors || touched[k] ? errors[k] : undefined);
  const italy = isItaly(value);
  const base: CSSProperties = { width: "100%", padding: "11px 12px", fontSize: 15, ...inputStyle };
  const field = (k: PartKey, extra?: CSSProperties): CSSProperties => ({
    ...base,
    ...(err(k) ? { borderColor: "var(--danger)" } : {}),
    ...extra,
  });

  return (
    <div>
      <input
        id={`${idPrefix}-street`}
        ref={streetRef}
        className={inputClassName}
        type="text"
        autoComplete="off"
        value={value.street}
        onChange={(e) => set("street", e.target.value)}
        onBlur={() => touch("street")}
        placeholder="Via / piazza (es. Via Roma)"
        maxLength={120}
        style={field("street")}
        aria-label="Via o piazza"
      />
      <FieldError msg={err("street")} />
      <Status google={google} source={value.source} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <input
            id={`${idPrefix}-number`}
            className={inputClassName}
            type="text"
            inputMode="text"
            value={value.number}
            onChange={(e) => set("number", e.target.value)}
            onBlur={() => touch("number")}
            placeholder="N. civico (o SNC)"
            maxLength={12}
            style={field("number")}
            aria-label="Numero civico"
          />
          <FieldError msg={err("number")} />
        </div>
        <div>
          <input
            id={`${idPrefix}-cap`}
            className={inputClassName}
            type="text"
            inputMode={italy ? "numeric" : "text"}
            value={value.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            onBlur={() => touch("postalCode")}
            placeholder={italy ? "CAP (5 cifre)" : "Codice postale"}
            maxLength={10}
            style={field("postalCode")}
            aria-label="CAP"
          />
          <FieldError msg={err("postalCode")} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <input
            id={`${idPrefix}-city`}
            className={inputClassName}
            type="text"
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
            onBlur={() => touch("city")}
            placeholder="Città"
            maxLength={80}
            style={field("city")}
            aria-label="Città"
          />
          <FieldError msg={err("city")} />
        </div>
        <div>
          <input
            id={`${idPrefix}-prov`}
            className={inputClassName}
            type="text"
            value={value.province}
            onChange={(e) => set("province", e.target.value)}
            onBlur={() => touch("province")}
            placeholder={italy ? "Prov. (es. MI)" : "Stato/regione"}
            maxLength={italy ? 2 : 40}
            style={field("province", italy ? { textTransform: "uppercase" } : undefined)}
            aria-label="Provincia"
          />
          <FieldError msg={err("province")} />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <input
          id={`${idPrefix}-country`}
          className={inputClassName}
          type="text"
          list={`${idPrefix}-countries`}
          value={value.country}
          onChange={(e) => set("country", e.target.value)}
          onBlur={() => touch("country")}
          placeholder="Paese"
          maxLength={60}
          style={field("country")}
          aria-label="Paese"
        />
        <datalist id={`${idPrefix}-countries`}>
          {COUNTRY_CODES.map((c) => (
            <option key={c.c + c.n} value={c.n} />
          ))}
        </datalist>
        <FieldError msg={err("country")} />
      </div>
    </div>
  );
}

function Status({ google, source }: { google: "loading" | "ready" | "off"; source?: "google" | "manual" }) {
  if (google === "loading") return null;
  if (google === "off") {
    return (
      <p style={{ fontSize: 11.5, color: "var(--warning-fg)", margin: "6px 0 0", lineHeight: 1.4 }}>
        Suggerimenti Google Maps non disponibili: compila tutti i campi a mano.
      </p>
    );
  }
  if (source === "google") {
    return (
      <p style={{ fontSize: 12, color: "var(--success-fg)", fontWeight: 600, margin: "6px 0 0" }}>
        ✓ Indirizzo normalizzato da Google Maps — controlla i campi e correggi se serve.
      </p>
    );
  }
  return (
    <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: "6px 0 0", lineHeight: 1.4 }}>
      Inizia a scrivere la via e scegli l&apos;indirizzo dalla lista: i campi si compilano da soli.
    </p>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" style={{ fontSize: 11.5, color: "var(--danger-fg)", margin: "4px 0 0", lineHeight: 1.35 }}>
      {msg}
    </p>
  );
}
