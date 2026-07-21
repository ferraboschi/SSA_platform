// International dial codes — ONE source of truth (public exam registration form,
// the "aggiungi posto extra" enrollment form, and the confirm-your-data form).
// Italy first (the SSA audience), then neighbours, then broader.

export const COUNTRY_CODES: { c: string; n: string; f: string }[] = [
  { c: "+39", n: "Italia", f: "🇮🇹" },
  { c: "+41", n: "Svizzera", f: "🇨🇭" },
  { c: "+378", n: "San Marino", f: "🇸🇲" },
  { c: "+33", n: "Francia", f: "🇫🇷" },
  { c: "+49", n: "Germania", f: "🇩🇪" },
  { c: "+44", n: "Regno Unito", f: "🇬🇧" },
  { c: "+34", n: "Spagna", f: "🇪🇸" },
  { c: "+43", n: "Austria", f: "🇦🇹" },
  { c: "+32", n: "Belgio", f: "🇧🇪" },
  { c: "+31", n: "Paesi Bassi", f: "🇳🇱" },
  { c: "+351", n: "Portogallo", f: "🇵🇹" },
  { c: "+30", n: "Grecia", f: "🇬🇷" },
  { c: "+353", n: "Irlanda", f: "🇮🇪" },
  { c: "+352", n: "Lussemburgo", f: "🇱🇺" },
  { c: "+386", n: "Slovenia", f: "🇸🇮" },
  { c: "+385", n: "Croazia", f: "🇭🇷" },
  { c: "+420", n: "Rep. Ceca", f: "🇨🇿" },
  { c: "+48", n: "Polonia", f: "🇵🇱" },
  { c: "+46", n: "Svezia", f: "🇸🇪" },
  { c: "+45", n: "Danimarca", f: "🇩🇰" },
  { c: "+47", n: "Norvegia", f: "🇳🇴" },
  { c: "+1", n: "USA / Canada", f: "🇺🇸" },
  { c: "+81", n: "Giappone", f: "🇯🇵" },
  { c: "+86", n: "Cina", f: "🇨🇳" },
  { c: "+61", n: "Australia", f: "🇦🇺" },
  { c: "+971", n: "Emirati Arabi", f: "🇦🇪" },
];

/** Split a stored "+39 333…" phone into its dial code + local number. Uses
 *  LONGEST-match so "+378"/"+351"/"+386" win over "+3…"; a leading "+code" we
 *  don't list is KEPT verbatim (never relabeled +39 with its prefix stripped —
 *  that used to corrupt San Marino/Portugal/Slovenia numbers). Only a value with
 *  no dial code at all defaults to Italy, leaving the local number intact. */
export function splitPhone(val: string): { code: string; num: string } {
  const s = (val || "").trim();
  if (s.startsWith("+")) {
    const match = COUNTRY_CODES.map((x) => x.c)
      .sort((a, b) => b.length - a.length)
      .find((c) => s.startsWith(c));
    if (match) return { code: match, num: s.slice(match.length).trim() };
    // A "+" code we don't have listed: keep it rather than corrupt the number.
    const m = /^(\+\d{1,4})\s*(.*)$/.exec(s);
    if (m) return { code: m[1], num: m[2] };
  }
  return { code: "+39", num: s };
}
