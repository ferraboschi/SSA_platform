// Civic-number heuristic — PURE module, shared by the /conferma client form
// and the server action so they can never disagree.
//
// The owner's field test exposed the naive check ("any digit in the address"):
// the POSTAL CODE made every address pass, civic number or not. The reliable
// signal is Google Places' street_number component; this heuristic only covers
// hand-typed addresses, and errs on the side of ASKING (a small extra field)
// rather than trusting a stray digit:
//  - the STREET segment counts (before the first comma) — CAPs/cities live in
//    later segments — PLUS the segment right after it when it is a standalone
//    civic number: Google Places formats Italian addresses as
//    "Via Lorenteggio, 25, 20146 Milano MI, Italia" (comma between street and
//    number), which the street-only rule wrongly flagged as missing;
//  - 5-digit groups are stripped from the street segment (an Italian CAP typed
//    inline), and the standalone rule caps at 4 digits so a bare CAP segment
//    never passes;
//  - "SNC" (senza numero civico) is accepted anywhere.
export function addressHasCivico(address: string): boolean {
  const a = String(address ?? "");
  if (/\bsnc\b/i.test(a)) return true;
  const segments = a.split(",");
  const street = segments[0] ?? "";
  if (/\d/.test(street.replace(/\b\d{5}\b/g, " "))) return true;
  // "Via X, 25, …" / "Via X, 12/B, …" — the whole second segment IS the number.
  const next = (segments[1] ?? "").trim();
  return /^\d{1,4}(\s*[\/\-]?\s*[a-z]{1,3}|\s*[\/\-]\s*\d{1,4}|\s+bis|\s+ter)?$/i.test(next);
}
