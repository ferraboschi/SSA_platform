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
}
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
  className = "exam-public-input",
  textareaClassName = "exam-public-textarea",
  placeholder = "Inizia a digitare l'indirizzo…",
}: {
  value: string;
  onChange: (v: string) => void;
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
          fields: ["formatted_address"],
        });
        ac.addListener("place_changed", () => {
          const a = ac.getPlace().formatted_address;
          if (a) onChange(a);
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
        className={textareaClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }
  return (
    <input
      ref={ref}
      className={className}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
