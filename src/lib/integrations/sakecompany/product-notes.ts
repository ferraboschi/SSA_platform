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

/** A single Shopify product metafield, as returned by the Admin REST API. */
export interface RawMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ProductFacts extends ProductNotes {
  region: string | null;
  /** Alcohol by volume, as the store's own label (e.g. "15.5%") — not parsed
   *  to a number, just relayed as text. */
  abv: string | null;
  /** Suggested food pairing, comma-joined when the source lists several. */
  pairing: string | null;
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

/** One structured `<h6>Label<br><strong>Value</strong></h6>` fact from the
 *  legacy body_html shape (verified live: "Regione", "Gradazione alcolica",
 *  among others) — null when the label isn't present. */
function extractH6Fact(html: string, label: string): string | null {
  const re = new RegExp(`<h6>\\s*${label}\\s*<br\\s*/?>\\s*<strong>([\\s\\S]*?)<\\/strong>`, "i");
  const m = re.exec(html);
  return m ? stripTags(m[1]) || null : null;
}

/** Plain text from a Shopify `rich_text_field` metafield value (a JSON tree
 *  of `{type, children}` nodes) — concatenates every text node's value. */
function richTextToPlain(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const root: unknown = JSON.parse(json);
    const parts: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as { type?: string; value?: unknown; children?: unknown[] };
      if (n.type === "text" && typeof n.value === "string") parts.push(n.value);
      if (Array.isArray(n.children)) n.children.forEach(walk);
    };
    walk(root);
    return parts.join(" ").replace(/\s+/g, " ").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Full product facts (aroma, notes, region, ABV, food pairing), preferring
 * the current "hoculus" metafield namespace (verified live: the dominant
 * schema — ~3 in 4 active products) and falling back to the legacy
 * body_html shape (`parseProductNotes` + the `<h6>` fact block) for older
 * products that predate it. Missing pieces degrade to null, never throw —
 * the catalog must never break because one product's data is incomplete.
 */
export function extractProductFacts(
  bodyHtml: string | null | undefined,
  metafields: RawMetafield[] | null | undefined,
): ProductFacts {
  const mfs = metafields ?? [];
  const mf = (namespace: string, key: string): string | null => {
    const found = mfs.find((m) => m.namespace === namespace && m.key === key);
    return found && found.value.trim() ? found.value : null;
  };

  const { aroma: bodyAroma, notes: bodyNotes } = parseProductNotes(bodyHtml);
  const html = bodyHtml ?? "";
  const bodyRegion = extractH6Fact(html, "Regione");
  const bodyAbv = extractH6Fact(html, "Gradazione alcolica");

  // Up to 6 pairing icons (verified live: up to 4 in use); each is a plain
  // label ("SUSHI", "FRUTTI DI MARE", …) — join the ones actually set.
  const pairingIcons = [1, 2, 3, 4, 5, 6]
    .map((n) => mf("hoculus", `abbinamento_icona_${n}_etichetta`))
    .filter((v): v is string => Boolean(v));
  // Legacy fallback: the bare "bestwith" namespace (not the numbered
  // per-locale duplicates seen on some products, whose prefix isn't
  // predictable) — a comma-separated list already.
  const legacyPairing = mf("bestwith", "captions");

  return {
    aroma: richTextToPlain(mf("hoculus", "descrizione_breve")) ?? bodyAroma,
    notes: richTextToPlain(mf("hoculus", "descrizione_lunga")) ?? bodyNotes,
    region: mf("hoculus", "regione")?.trim() || bodyRegion,
    abv: mf("hoculus", "percentuale_alcolica")?.trim() || bodyAbv,
    pairing: pairingIcons.length ? pairingIcons.join(", ") : legacyPairing,
  };
}
