"use client";

// Google Places address autocomplete (optional) — SHARED by the public exam
// registration (exam-inputs.tsx) and the /conferma attendee page.
//
// Enabled only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (Render env; the key
// is public by design — it must be HTTP-referrer-restricted in Google Cloud).
// Without the key, or on script/key failure, the field degrades gracefully to a
// plain input/textarea — nothing blocks.
import { useEffect, useRef } from "react";

interface GPlace {
  formatted_address?: string;
  address_components?: Array<{ types: string[]; long_name: string; short_name: string }>;
}

/** What the selected place told us about the street number — null when the
 *  value was typed by hand (or no key), so provenance is unknown. */
export interface AddressPlaceMeta {
  hasStreetNumber: boolean;
  country?: string;
}

// A street number can live under different component types abroad: classic
// street_number, premise (named/numbered buildings), or Japan's block numbers
// (sublocality_level_4). Any of them satisfies the courier.
const NUMBER_TYPES = ["street_number", "premise", "sublocality_level_4"];
interface GAutocomplete {
  addListener(ev: string, cb: () => void): void;
  getPlace(): GPlace;
}
interface GMaps {
  maps: { places: { Autocomplete: new (input: HTMLInputElement, opts?: object) => GAutocomplete } };
}
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
let gmapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined" || !GMAPS_KEY) return Promise.reject(new Error("no key"));
  const w = window as unknown as { google?: GMaps };
  if (w.google?.maps?.places) return Promise.resolve();
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=it`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gmaps load failed"));
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

export function GoogleAddressInput({
  value,
  onChange,
  id,
  className = "exam-public-input",
  textareaClassName = "exam-public-textarea",
  placeholder = "Inizia a digitare l'indirizzo…",
  onPlaceMeta,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Fired with the selected place's street-number info; null when the field
   *  is edited by hand afterwards (provenance lost). Optional — existing
   *  callers (public exam registration) are unaffected. */
  onPlaceMeta?: (meta: AddressPlaceMeta | null) => void;
  /** Binds the field to an external <label htmlFor>. */
  id?: string;
  /** Class for the autocomplete input (default: exam-public styling). */
  className?: string;
  /** Class for the no-key textarea fallback. */
  textareaClassName?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!GMAPS_KEY) return;
    loadGoogleMaps()
      .then(() => {
        const w = window as unknown as { google?: GMaps };
        if (!ref.current || !w.google) return;
        const ac = new w.google.maps.places.Autocomplete(ref.current, {
          types: ["address"],
          // address_components shares formatted_address's Basic Data SKU —
          // requesting it costs nothing extra and carries the street number.
          fields: ["formatted_address", "address_components"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const a = place.formatted_address;
          if (a) onChange(a);
          if (onPlaceMeta) {
            const comps = place.address_components ?? [];
            onPlaceMeta({
              hasStreetNumber: comps.some((c) => c.types.some((t) => NUMBER_TYPES.includes(t))),
              country: comps.find((c) => c.types.includes("country"))?.short_name,
            });
          }
        });
      })
      .catch(() => {
        /* key invalid / network → keep the input usable as free text */
      });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!GMAPS_KEY) {
    return (
      <textarea
        id={id}
        className={textareaClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    );
  }
  return (
    <input
      id={id}
      ref={ref}
      className={className}
      type="text"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        onPlaceMeta?.(null); // hand-edited → the Places metadata no longer applies
      }}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
