// Civic-number heuristic — PURE module, shared by the /conferma client form
// and the server action so they can never disagree.
//
// The owner's field test exposed the naive check ("any digit in the address"):
// the POSTAL CODE made every address pass, civic number or not. The reliable
// signal is Google Places' street_number component; this heuristic only covers
// hand-typed addresses, and errs on the side of ASKING (a small extra field)
// rather than trusting a stray digit:
//  - only the STREET segment counts (before the first comma) — CAPs/cities
//    live in later segments;
//  - 5-digit groups are stripped even there (an Italian CAP typed inline);
//  - "SNC" (senza numero civico) is accepted anywhere.
export function addressHasCivico(address: string): boolean {
  const a = String(address ?? "");
  if (/\bsnc\b/i.test(a)) return true;
  const street = a.split(",")[0] ?? "";
  return /\d/.test(street.replace(/\b\d{5}\b/g, " "));
}
