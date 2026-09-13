// Accent-insensitive matching for the platform's searches — the ONE normalizer
// shared by the index builder (shell-data) and the query side (GlobalSearch,
// CorsistiList): «forli» finds «Forlì», «nicolo» finds «Nicolò». Pure, tested.

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Lowercase + strip diacritics (NFD, drop the combining marks). Whitespace is
 *  left untouched so the result can be mapped back onto the input char by char. */
function foldChars(s: string): string {
  return s.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** Fold a query or a haystack field: diacritics stripped, lowercase, whitespace
 *  collapsed and trimmed. Apply to BOTH sides of a match. */
export function foldSearch(s: string): string {
  return foldChars(s).replace(/\s+/g, " ").trim();
}

// Never whitespace, so a multi-word query cannot match across two adjacent
// fields («rossi milano» must not hit surname "Rossi" + city "Milano").
const FIELD_SEP = " · ";

/** Haystack for an entry: each field folded, empty ones dropped, joined by a
 *  non-whitespace separator. Match it with `includes(foldSearch(query))`. */
export function foldFields(fields: (string | null | undefined)[]): string {
  return fields
    .map((f) => foldSearch(f ?? ""))
    .filter(Boolean)
    .join(FIELD_SEP);
}

/** [start, end) of the first accent-insensitive occurrence of `query` inside
 *  `text`, as offsets into the ORIGINAL string (for highlighting); null when
 *  absent. Folding can change string length («ì» → «i» once decomposed), so
 *  the text is folded one code point at a time and the hit mapped back. */
export function foldMatchRange(text: string, query: string): [number, number] | null {
  const fq = foldSearch(query);
  if (!fq) return null;
  let folded = "";
  const origAt: number[] = []; // folded index → offset of its source code point
  let offset = 0;
  for (const ch of text) {
    const f = foldChars(ch);
    for (let i = 0; i < f.length; i++) origAt.push(offset);
    folded += f;
    offset += ch.length;
  }
  const idx = folded.indexOf(fq);
  if (idx < 0) return null;
  const start = origAt[idx];
  const last = idx + fq.length - 1;
  // End after the last matched code point — including any combining marks that
  // followed it in the original (they fold to nothing and must stay attached).
  let end = origAt[last] + [...text.slice(origAt[last])][0].length;
  while (end < text.length && foldChars(text[end]) === "") end++;
  return [start, end];
}
