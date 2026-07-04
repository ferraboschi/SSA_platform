// Pure HTML→text extraction for a Sake Company product description
// (`body_html`), split into two owner-requested pieces for the educator's
// Programma tab: a short "aroma" hook and a longer narrative "notes" section.
//
// Shopify product descriptions here follow a consistent shape (verified
// against live Sake Company data): a bold opening sentence naming the aroma
// profile, then a structured fact block (region, SMV, seimai buai, ABV,
// serving temperature), then an HTML comment `<!-- split -->`, then a longer
// narrative paragraph about production/character. Not every product follows
// this exactly — the parser degrades gracefully (no split marker → the whole
// body becomes "notes"; no bold sentence → "aroma" is null).

export interface ProductNotes {
  /** Short aroma/tasting hook — the bold opening sentence, plain text. */
  aroma: string | null;
  /** Longer narrative commentary (production, character, pairing), plain text. */
  notes: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z0-9#]+;/gi, "");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseProductNotes(bodyHtml: string | null | undefined): ProductNotes {
  const html = (bodyHtml ?? "").trim();
  if (!html) return { aroma: null, notes: null };

  const [head = "", ...restParts] = html.split("<!-- split -->");
  const tail = restParts.join(" ").trim();

  const strongMatch = /<strong>([\s\S]*?)<\/strong>/i.exec(head);
  const aroma = strongMatch ? stripTags(strongMatch[1]) || null : null;

  // Prefer the section after the split marker (the narrative commentary); if
  // there's no marker, fall back to whatever follows the aroma hook in the
  // head (still real product info, just not narrative-only).
  const notesSource = tail || (strongMatch ? head.slice(strongMatch.index + strongMatch[0].length) : head);
  const notes = stripTags(notesSource) || null;

  return { aroma, notes };
}
