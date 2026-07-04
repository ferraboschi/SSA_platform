import { describe, it, expect } from "vitest";
import { parseProductNotes, extractProductFacts, type RawMetafield } from "./product-notes";

// Real Sake Company body_html sample (Akita Kaori 720ml), captured live to
// ground the parser in the actual shape rather than a guess.
const REAL_SAMPLE = `<p><strong>In questo sake il riso viene raffreddato a -5 gradi durante la produzione, questo dona un aroma floreale fruttato, un ricco bouquet di aromi.</strong></p>
<h6>Regione<br><strong>Akita</strong>
</h6>
<h6>Sake Meter Value<br><strong>+3 (Slightly Dry)</strong>
</h6>
<h6>Seimai Buai (residuo di sbramatura)<br><strong>60% (molto raffinato)</strong>
</h6>
<h6>Gradazione alcolica<br><strong>15.5%</strong>
</h6>
<h6>Temperatura di servizio<br><strong>8<sup>o</sup> - 20<sup>o</sup>C</strong>
</h6>
<!-- split -->
<p>Sake Junmai Ginjo prodotto con riso Akitasakekomachi, le sue caratteristiche peculiari sono dovute all'utilizzo del lievito "Komachi kobo special". <br>Il risultato e' un Junmai Ginjo dal profumo straordinario ed un gusto delicato.</p>
<p><br>Il Kobo (lievito) in questo premium sake gioca un ruolo fondamentale nella sua qualitÃ  e aroma.</p>`;

describe("parseProductNotes", () => {
  it("extracts the bold aroma hook and the post-split narrative, both as plain text", () => {
    const { aroma, notes } = parseProductNotes(REAL_SAMPLE);
    expect(aroma).toBe(
      "In questo sake il riso viene raffreddato a -5 gradi durante la produzione, questo dona un aroma floreale fruttato, un ricco bouquet di aromi.",
    );
    expect(notes).toContain("Junmai Ginjo prodotto con riso Akitasakekomachi");
    expect(notes).toContain("Kobo");
    // The structured fact block (Regione, SMV, …) belongs to neither field.
    expect(notes).not.toContain("Seimai Buai");
    expect(aroma).not.toContain("<strong>");
  });

  it("empty/blank input → both null", () => {
    expect(parseProductNotes(null)).toEqual({ aroma: null, notes: null });
    expect(parseProductNotes(undefined)).toEqual({ aroma: null, notes: null });
    expect(parseProductNotes("   ")).toEqual({ aroma: null, notes: null });
  });

  it("no split marker: aroma from the bold sentence, notes from what follows it", () => {
    const html = "<p><strong>Aroma secco e minerale.</strong> Prodotto a Niigata con riso locale.</p>";
    const { aroma, notes } = parseProductNotes(html);
    expect(aroma).toBe("Aroma secco e minerale.");
    expect(notes).toBe("Prodotto a Niigata con riso locale.");
  });

  it("no bold sentence at all: aroma is null, the whole body becomes notes", () => {
    const html = "<p>Solo una descrizione semplice, senza enfasi.</p>";
    const { aroma, notes } = parseProductNotes(html);
    expect(aroma).toBeNull();
    expect(notes).toBe("Solo una descrizione semplice, senza enfasi.");
  });

  it("decodes common HTML entities and collapses whitespace", () => {
    const html = "<p><strong>Gusto secco &amp; fruttato &nbsp; con nota di riso.</strong></p>";
    const { aroma } = parseProductNotes(html);
    expect(aroma).toBe("Gusto secco & fruttato con nota di riso.");
  });
});

describe("extractProductFacts", () => {
  // Real "hoculus" metafields (64-18 Junmai Quasi Dai 750ml), captured live —
  // the dominant current schema (~3 in 4 active products), body_html empty.
  const HOCULUS_METAFIELDS: RawMetafield[] = [
    {
      namespace: "hoculus",
      key: "descrizione_breve",
      type: "rich_text_field",
      value:
        '{"type":"root","children":[{"type":"paragraph","children":[{"type":"text","value":"64-18 è un sake sperimentale, tecnico e sorprendentemente fresco.\\nAromatico ed elegante."}]}]}',
    },
    {
      namespace: "hoculus",
      key: "descrizione_lunga",
      type: "rich_text_field",
      value:
        '{"type":"root","children":[{"type":"paragraph","children":[{"type":"text","value":"In Italia, le macchine per la sbiancatura del riso non riescono a scendere sotto il 64%."}]}]}',
    },
    { namespace: "hoculus", key: "regione", type: "single_line_text_field", value: "Italia" },
    { namespace: "hoculus", key: "percentuale_alcolica", type: "single_line_text_field", value: "12%" },
    { namespace: "hoculus", key: "abbinamento_icona_1_etichetta", type: "single_line_text_field", value: "SUSHI" },
    { namespace: "hoculus", key: "abbinamento_icona_2_etichetta", type: "single_line_text_field", value: "FRUTTI DI MARE" },
    { namespace: "hoculus", key: "abbinamento_icona_3_etichetta", type: "single_line_text_field", value: "FORMAGGI FRESCHI" },
    { namespace: "hoculus", key: "abbinamento_icona_4_etichetta", type: "single_line_text_field", value: "DOLCI" },
  ];

  it("prefers hoculus metafields when present (current schema)", () => {
    const facts = extractProductFacts(null, HOCULUS_METAFIELDS);
    expect(facts.aroma).toContain("64-18 è un sake sperimentale");
    expect(facts.notes).toContain("macchine per la sbiancatura del riso");
    expect(facts.region).toBe("Italia");
    expect(facts.abv).toBe("12%");
    expect(facts.pairing).toBe("SUSHI, FRUTTI DI MARE, FORMAGGI FRESCHI, DOLCI");
  });

  it("falls back to body_html <h6> facts + legacy bestwith.captions (no hoculus metafields)", () => {
    const html = `<p><strong>Aroma floreale fruttato.</strong></p>
<h6>Regione<br><strong>Akita</strong>
</h6>
<h6>Gradazione alcolica<br><strong>15.5%</strong>
</h6>
<!-- split -->
<p>Narrativa di produzione.</p>`;
    const legacyMetafields: RawMetafield[] = [
      { namespace: "bestwith", key: "captions", type: "string", value: "White fish, Sashimi, Tofu" },
    ];
    const facts = extractProductFacts(html, legacyMetafields);
    expect(facts.aroma).toBe("Aroma floreale fruttato.");
    expect(facts.notes).toBe("Narrativa di produzione.");
    expect(facts.region).toBe("Akita");
    expect(facts.abv).toBe("15.5%");
    expect(facts.pairing).toBe("White fish, Sashimi, Tofu");
  });

  it("degrades to all-null with no body_html and no metafields", () => {
    const facts = extractProductFacts(null, null);
    expect(facts).toEqual({ aroma: null, notes: null, region: null, abv: null, pairing: null });
  });

  it("ignores malformed rich-text JSON instead of throwing", () => {
    const metafields: RawMetafield[] = [
      { namespace: "hoculus", key: "descrizione_breve", type: "rich_text_field", value: "{not json" },
    ];
    const facts = extractProductFacts(null, metafields);
    expect(facts.aroma).toBeNull();
  });
});
