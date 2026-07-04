import { describe, it, expect } from "vitest";
import { parseProductNotes } from "./product-notes";

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
