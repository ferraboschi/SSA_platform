// ============================================================================
// Structured delivery address — PURE module (only the pure dial-code list), shared by the
// /conferma client form, the server action, the data mappers and the tests, so
// client and server can never disagree on what "complete" means.
//
// Owner rule (25/9/2026): EVERY component of the delivery address is mandatory
// — street, civic number, postal code, city, country (province for Italy) —
// not just the civic number. Google Places (when the browser key is set)
// proposes the normalized address and fills the parts; the student can still
// correct any field by hand. The canonical single line (`composeDeliveryLine`)
// is what gets stored in `delivery_address` and printed on labels; the parts
// go to `delivery_address_parts` (jsonb) when that column exists.
// ============================================================================

import { COUNTRY_CODES } from "@/lib/phone/dial-codes";

export interface DeliveryAddressParts {
  /** "Via Ratti" — street / square name, without the civic number. */
  street: string;
  /** "1", "12/B", "12 bis" or "SNC" (senza numero civico). */
  number: string;
  /** "23849" — CAP / postal code. */
  postalCode: string;
  /** "Rogeno" */
  city: string;
  /** Italian sigla ("LC"); state/region abbreviation abroad; "" when unknown. */
  province: string;
  /** "Italia" — country name as shown to the student. */
  country: string;
  /** ISO-3166 alpha-2 when known ("IT"). */
  countryCode?: string;
  /** Where the parts came from: a Google Places pick, or typed by hand. */
  source?: "google" | "manual";
  /** Google place id when picked (audit / re-geocoding). */
  placeId?: string;
  /** Google's formatted_address when picked (audit). */
  formatted?: string;
}

// No countryCode here on purpose: for a hand-typed address the COUNTRY TEXT
// decides the rules (a stale "IT" once forced CAP/sigla onto Swiss addresses —
// pre-deploy review blocker); the code is derived in normalizeDeliveryParts.
export const EMPTY_DELIVERY_PARTS: DeliveryAddressParts = {
  street: "",
  number: "",
  postalCode: "",
  city: "",
  province: "",
  country: "Italia",
  source: "manual",
};

/** Upper bound for the composed line (also the DB column's practical size). */
export const MAX_DELIVERY_LINE = 300;

export type DeliveryPartsErrors = Partial<Record<keyof DeliveryAddressParts, string>>;

const collapse = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

const ITALY_TEXT = /^(italia|italy|it|italie|italien)$/i;

/** Whether the address is Italian (CAP + sigla rules). The country TEXT
 *  decides whenever it is present — it is what the student typed or chose;
 *  the ISO code only stands in when there is no text at all. */
export function isItaly(p: Pick<DeliveryAddressParts, "country" | "countryCode">): boolean {
  const text = collapse(p.country);
  if (text) return ITALY_TEXT.test(text);
  return (p.countryCode ?? "").toUpperCase() === "IT";
}

/** Civic-number grammar (source string, reused by the legacy-line parser):
 *  "12", "12/B", "12b", "12 bis", "12-14", Japanese blocks "1-2-3". */
const CIVICO = String.raw`\d{1,4}(?:\s?[\/-]\s?\d{1,4}){0,2}(?:\s?[a-z]{1,3}|\s?[\/-]\s?[a-z0-9]{1,4}|\s+(?:bis|ter|quater))?`;
const CIVICO_RE = new RegExp(`^${CIVICO}$`, "i");

/** Civic number: digits with an optional letter/bis suffix ("12", "12/B",
 *  "12 bis", "12-14"), Japanese chome-ban-go blocks ("1-2-3"), or SNC (senza
 *  numero civico). Never a bare CAP. */
export function isValidCivico(s: string): boolean {
  const v = collapse(s);
  if (!v || v.length > 12) return false;
  if (/^s\.?n\.?c\.?$/i.test(v)) return true;
  return CIVICO_RE.test(v);
}

/** Trim/collapse every field, uppercase codes, digits-only Italian CAPs.
 *  The ISO country code is DERIVED from the country text for a hand-typed
 *  address (so it can never contradict what the student wrote); a Google
 *  pick keeps the code Google returned. Free-text audit fields are bounded. */
export function normalizeDeliveryParts(p: Partial<DeliveryAddressParts> | null | undefined): DeliveryAddressParts {
  const src = p ?? {};
  const country = collapse(src.country) || "";
  const source: "google" | "manual" = src.source === "google" ? "google" : "manual";
  const provided = collapse(src.countryCode).toUpperCase();
  const italy = isItaly({ country, countryCode: provided });
  const countryCode =
    source === "google" && /^[A-Z]{2}$/.test(provided) ? provided : italy ? "IT" : undefined;
  const out: DeliveryAddressParts = {
    street: collapse(src.street).slice(0, 120),
    number: collapse(src.number).replace(/^s\.?n\.?c\.?$/i, "SNC").slice(0, 12),
    postalCode: collapse(src.postalCode).toUpperCase().slice(0, 10),
    city: collapse(src.city).slice(0, 80),
    province: (italy ? collapse(src.province).toUpperCase() : collapse(src.province)).slice(0, 40),
    country: country.slice(0, 60),
    source,
  };
  if (countryCode) out.countryCode = countryCode;
  if (src.placeId) out.placeId = collapse(src.placeId).slice(0, 200);
  if (src.formatted) out.formatted = collapse(src.formatted).slice(0, MAX_DELIVERY_LINE);
  return out;
}

/** Field-level validation; an empty object means the address is complete.
 *  Messages are student-facing Italian (the /conferma page is Italian). */
export function validateDeliveryParts(p: DeliveryAddressParts): DeliveryPartsErrors {
  const e: DeliveryPartsErrors = {};
  const italy = isItaly(p);
  if (!p.street) e.street = "Inserisci la via o la piazza.";
  else if (p.street.length < 3) e.street = "Via troppo corta.";
  else if (p.street.length > 120) e.street = "Via troppo lunga.";
  else if (/\d\s*$/.test(p.street) && !p.number) e.street = "Metti il numero civico nel suo campo.";
  if (!p.number) e.number = "Inserisci il numero civico (o SNC se manca).";
  // Abroad a 5-digit house number is real (US "10000 Santa Monica Blvd");
  // in Italy 5 digits can only be a CAP typed in the wrong field.
  else if (!isValidCivico(p.number) && !(!italy && /^\d{5}$/.test(p.number))) {
    e.number = 'Numero civico non valido (es. 12, 12/B, oppure "SNC").';
  }
  if (!p.postalCode) e.postalCode = italy ? "Inserisci il CAP." : "Inserisci il codice postale.";
  else if (italy && !/^\d{5}$/.test(p.postalCode)) e.postalCode = "Il CAP italiano ha 5 cifre.";
  else if (!italy && !/^[A-Z0-9][A-Z0-9 -]{1,9}$/i.test(p.postalCode)) e.postalCode = "Codice postale non valido.";
  if (!p.city) e.city = "Inserisci la città.";
  else if (p.city.length < 2 || p.city.length > 80) e.city = "Città non valida.";
  if (italy) {
    if (!p.province) e.province = "Inserisci la sigla della provincia (es. MI).";
    else if (!/^[A-Z]{2}$/.test(p.province)) e.province = "La provincia è la sigla di 2 lettere (es. MI).";
  } else if (p.province.length > 40) e.province = "Provincia/stato troppo lungo.";
  if (!p.country) e.country = "Inserisci il paese.";
  else if (p.country.length < 2 || p.country.length > 60) e.country = "Paese non valido.";
  if (Object.keys(e).length === 0 && composeDeliveryLine(p).length > MAX_DELIVERY_LINE) {
    e.street = "Indirizzo troppo lungo.";
  }
  return e;
}

/** Canonical one-line address for labels and the `delivery_address` column:
 *  "Via Ratti 1, 23849 Rogeno LC, Italia". */
export function composeDeliveryLine(p: DeliveryAddressParts): string {
  const streetLine = [p.street, p.number].filter(Boolean).join(" ");
  const cityLine = [p.postalCode, p.city, p.province].filter(Boolean).join(" ");
  return [streetLine, cityLine, p.country].filter(Boolean).join(", ");
}

// ── Google Places → parts ────────────────────────────────────────────────────

export interface GoogleAddressComponent {
  types: string[];
  long_name: string;
  short_name: string;
}

/** Map a Google Places result to parts. Italy: province = the sigla in
 *  administrative_area_level_2; abroad: the level-1 (state) short name.
 *  Japan's block numbers (sublocality_level_4) stand in for street_number. */
export function partsFromGooglePlace(
  components: GoogleAddressComponent[],
  formatted?: string,
  placeId?: string,
): DeliveryAddressParts {
  const find = (t: string) => components.find((c) => c.types.includes(t));
  const countryC = find("country");
  const countryCode = countryC?.short_name?.toUpperCase();
  const italy = countryCode === "IT";
  const street = find("route")?.long_name ?? find("premise")?.long_name ?? "";
  const number =
    find("street_number")?.long_name ??
    (countryCode === "JP" ? find("sublocality_level_4")?.long_name : undefined) ??
    "";
  const city =
    find("locality")?.long_name ??
    find("postal_town")?.long_name ??
    find("administrative_area_level_3")?.long_name ??
    find("sublocality_level_1")?.long_name ??
    "";
  const province = italy
    ? (find("administrative_area_level_2")?.short_name ?? "")
    : (find("administrative_area_level_1")?.short_name ?? "");
  return normalizeDeliveryParts({
    street,
    number,
    postalCode: find("postal_code")?.long_name ?? "",
    city,
    province,
    country: countryC?.long_name ?? "",
    countryCode,
    source: "google",
    placeId,
    formatted,
  });
}

// ── Legacy single line → parts (best-effort prefill only) ────────────────────

/** Split a previously saved one-line address ("Via Ratti, 1, 23849 Rogeno LC,
 *  Italia" or "Via Roma 12, 20100 Milano") into parts so a returning student
 *  finds the fields pre-filled. Best effort: whatever is not recognised is
 *  left empty for the student to complete — never guessed. */
export function partsFromLegacyLine(line: string): Partial<DeliveryAddressParts> {
  const segs = collapse(line)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length === 0) return {};
  const out: Partial<DeliveryAddressParts> = { source: "manual" };
  const rest = [...segs];
  // Country: the LAST segment when it is a known country name, or when the
  // line has at least three segments and the last one is plain text ("Via
  // Roma 12, Milano" keeps Milano as the CITY — review NIT).
  if (rest.length >= 2) {
    const last = rest[rest.length - 1];
    const plain = /^[a-zà-ÿ .'-]+$/i.test(last) && !/\d/.test(last) && !/^\S+\s[A-Z]{2}$/.test(last);
    if (plain && (isKnownCountry(last) || rest.length >= 3)) out.country = rest.pop();
  }
  // Street (+ civic number) from the first segment: trailing ("Via Roma 12",
  // Italian) or leading ("10 Downing Street", "1-2-3 Ginza").
  const first = rest.shift() ?? "";
  const trailing = new RegExp(`^(.*?)[\\s,]+(${CIVICO})$`, "i").exec(first);
  const leading = new RegExp(`^(${CIVICO})\\s+(.{3,})$`, "i").exec(first);
  if (trailing && trailing[1].trim().length >= 3) {
    out.street = trailing[1].trim();
    out.number = trailing[2].trim();
  } else if (leading) {
    out.number = leading[1].trim();
    out.street = leading[2].trim();
  } else if (/^s\.?n\.?c\.?$/i.test(first)) {
    out.number = "SNC";
  } else {
    out.street = first;
  }
  // A standalone civic-number segment right after the street ("Via X, 25, …").
  if (!out.number && rest.length && isValidCivico(rest[0]) && !/^\d{5}$/.test(rest[0])) {
    out.number = rest.shift();
  }
  // "23849 Rogeno LC" / "20100 Milano" / "Milano MI".
  for (const s of rest) {
    const cap = /^(\d{4,5})\s+(.+?)(?:\s+([A-Z]{2}))?$/.exec(s);
    if (cap) {
      out.postalCode = cap[1];
      out.city = cap[2];
      if (cap[3]) out.province = cap[3];
      break;
    }
    const cityProv = /^([a-zà-ÿ' .-]+?)\s+([A-Z]{2})$/i.exec(s);
    if (cityProv && !out.city) {
      out.city = cityProv[1].trim();
      out.province = cityProv[2].toUpperCase();
    } else if (/^\d{5}$/.test(s) && !out.postalCode) {
      out.postalCode = s;
    } else if (!out.city && /^[a-zà-ÿ' .-]+$/i.test(s)) {
      out.city = s;
    }
  }
  return out;
}

/** Country names the legacy-line parser recognises (Italian + English forms
 *  of the countries in the dial-code list, plus the plain English names). */
const KNOWN_COUNTRIES = new Set(
  [
    ...COUNTRY_CODES.map((c) => c.n),
    "Italy", "Switzerland", "France", "Germany", "United Kingdom", "UK", "Spain", "Austria", "Belgium",
    "Netherlands", "Portugal", "Greece", "Ireland", "Luxembourg", "Slovenia", "Croatia", "Czech Republic",
    "Poland", "Sweden", "Denmark", "Norway", "Finland", "Japan", "Giappone", "USA", "United States",
    "Stati Uniti", "Canada", "Australia", "Brazil", "Brasile", "Argentina", "Mexico", "Messico", "China", "Cina",
    "Korea", "Corea", "Singapore", "Hong Kong", "Taiwan", "India", "Turkey", "Turchia", "Israel", "Israele",
    "Emirati Arabi Uniti", "United Arab Emirates", "Monaco", "Malta", "Cipro", "Cyprus", "Romania", "Bulgaria",
    "Ungheria", "Hungary", "Slovacchia", "Slovakia", "Serbia", "Albania", "Montenegro", "Bosnia", "Macedonia",
  ].map((n) => n.toLowerCase()),
);

export function isKnownCountry(name: string): boolean {
  return KNOWN_COUNTRIES.has(collapse(name).toLowerCase());
}
