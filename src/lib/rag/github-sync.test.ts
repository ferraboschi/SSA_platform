import { describe, it, expect } from "vitest";
import { cleanObsidianMarkdown, sectionFromPath, slugifySection } from "./github-sync";

// Pure parts of the GitHub KB sync only — no network, no Supabase. What gets
// persisted as chunk content must be clean prose: Obsidian syntax stripped,
// every word of prose (headings, wikilink labels) preserved.

describe("cleanObsidianMarkdown — frontmatter", () => {
  it("strips the YAML block and extracts a slugified section", () => {
    const raw = "---\ntitle: Koji\nsection: Produzione\ntags: [sake]\n---\n\n# Koji\n\nIl koji è una muffa nobile.";
    const { text, section } = cleanObsidianMarkdown(raw);
    expect(section).toBe("produzione");
    expect(text).not.toContain("---");
    expect(text).not.toContain("title:");
    expect(text).not.toContain("tags:");
    expect(text).toContain("Il koji è una muffa nobile.");
  });

  it("slugifies quoted multi-word section values", () => {
    const raw = '---\nsection: "Metodi di Produzione"\n---\ncorpo della nota';
    expect(cleanObsidianMarkdown(raw).section).toBe("metodi-di-produzione");
  });

  it("returns a null section when frontmatter has no section key", () => {
    const raw = "---\ntitle: Nota\n---\ncorpo";
    const { text, section } = cleanObsidianMarkdown(raw);
    expect(section).toBeNull();
    expect(text).toBe("corpo");
  });

  it("returns a null section when there is no frontmatter at all", () => {
    const { text, section } = cleanObsidianMarkdown("solo testo");
    expect(section).toBeNull();
    expect(text).toBe("solo testo");
  });

  it("does not treat a mid-document --- ruler as frontmatter", () => {
    const raw = "prima riga\n---\nsection: Falso\n---\ndopo";
    expect(cleanObsidianMarkdown(raw).section).toBeNull();
  });
});

describe("cleanObsidianMarkdown — Obsidian syntax", () => {
  it("keeps the label of aliased wikilinks", () => {
    expect(cleanObsidianMarkdown("vedi [[Koji|il koji]] per approfondire").text).toBe(
      "vedi il koji per approfondire",
    );
  });

  it("keeps the target text of plain wikilinks", () => {
    expect(cleanObsidianMarkdown("vedi [[Junmai Daiginjo]] qui").text).toBe("vedi Junmai Daiginjo qui");
  });

  it("removes embeds entirely", () => {
    const { text } = cleanObsidianMarkdown("prima ![[schema-koji.png]] dopo");
    expect(text).not.toContain("![[");
    expect(text).not.toContain("schema-koji");
    expect(text).toContain("prima");
    expect(text).toContain("dopo");
  });

  it("removes markdown images but keeps heading text", () => {
    const { text } = cleanObsidianMarkdown("## Fermentazione\n\n![diagramma](https://x.test/y.png)\n\nIl moromi…");
    expect(text).toContain("Fermentazione");
    expect(text).not.toContain("##");
    expect(text).not.toContain("https://x.test/y.png");
    expect(text).not.toContain("diagramma");
  });

  it("collapses runs of 3+ newlines to a single paragraph break", () => {
    expect(cleanObsidianMarkdown("a\n\n\n\n\nb").text).toBe("a\n\nb");
  });
});

describe("sectionFromPath — top-level-folder fallback", () => {
  it("uses the slugified top-level folder", () => {
    expect(sectionFromPath("Concetti/Koji.md")).toBe("concetti");
    expect(sectionFromPath("Clippings/articolo web.md")).toBe("clippings");
  });

  it("slugifies folders with spaces", () => {
    expect(sectionFromPath("Schede prodotto/Dassai 23.md")).toBe("schede-prodotto");
  });

  it("uses only the TOP-level folder for nested paths", () => {
    expect(sectionFromPath("Concetti/Produzione/Moto.md")).toBe("concetti");
  });

  it("maps root-level files to 'generale'", () => {
    expect(sectionFromPath("README.md")).toBe("generale");
  });
});

describe("slugifySection", () => {
  it("lowercases, strips accents and joins words with hyphens", () => {
    expect(slugifySection("Metodi di Produzione")).toBe("metodi-di-produzione");
    expect(slugifySection("Sakè & Cibo")).toBe("sake-cibo");
  });
});
