// International dial codes — one source of truth (used by the public exam
// registration form AND the "aggiungi posto extra" enrollment form). Italy first
// (the SSA audience), then common ones.

export const COUNTRY_CODES: { c: string; n: string }[] = [
  { c: "+39", n: "Italia" },
  { c: "+1", n: "USA / Canada" },
  { c: "+44", n: "Regno Unito" },
  { c: "+33", n: "Francia" },
  { c: "+49", n: "Germania" },
  { c: "+34", n: "Spagna" },
  { c: "+41", n: "Svizzera" },
  { c: "+43", n: "Austria" },
  { c: "+32", n: "Belgio" },
  { c: "+31", n: "Paesi Bassi" },
  { c: "+81", n: "Giappone" },
  { c: "+86", n: "Cina" },
  { c: "+61", n: "Australia" },
];

/** Split a stored "+39 333…" phone into its dial code + local number, defaulting
 *  to Italy (+39) when no known code prefixes the value. */
export function splitPhone(val: string): { code: string; num: string } {
  const m = /^(\+\d{1,4})\s*(.*)$/.exec(val.trim());
  if (m && COUNTRY_CODES.some((x) => x.c === m[1])) return { code: m[1], num: m[2] };
  return { code: "+39", num: val.replace(/^\+\d{1,4}\s*/, "") };
}
