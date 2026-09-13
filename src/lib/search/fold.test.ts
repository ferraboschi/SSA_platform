import { describe, it, expect } from "vitest";
import { foldFields, foldMatchRange, foldSearch } from "./fold";

describe("foldSearch", () => {
  it("strips accents so an unaccented query matches Italian names and cities", () => {
    expect(foldSearch("Forlì")).toBe("forli");
    expect(foldSearch("Nicolò")).toBe("nicolo");
    expect(foldSearch("NICOLÒ")).toBe("nicolo");
    expect(foldSearch("Città di Castello")).toBe("citta di castello");
    expect(foldSearch("Forlì").includes(foldSearch("forli"))).toBe(true);
  });

  it("leaves ASCII unchanged apart from case", () => {
    expect(foldSearch("Mario Rossi")).toBe("mario rossi");
    expect(foldSearch("mario@example.com")).toBe("mario@example.com");
    expect(foldSearch("Certificato 2025")).toBe("certificato 2025");
  });

  it("collapses and trims whitespace", () => {
    expect(foldSearch("  Mario \n  Rossi ")).toBe("mario rossi");
    expect(foldSearch("   ")).toBe("");
  });

  it("treats precomposed and decomposed input the same", () => {
    expect(foldSearch("Forlì")).toBe(foldSearch("Forli\u0300"));
  });
});

describe("foldFields", () => {
  it("folds every field and drops empty ones", () => {
    expect(foldFields(["Nicolò", null, "", "Forlì"])).toBe("nicolo · forli");
  });

  it("keeps a multi-word query from matching across two fields", () => {
    const hay = foldFields(["Anna Rossi", "Milano"]);
    expect(hay.includes(foldSearch("rossi milano"))).toBe(false);
    expect(hay.includes(foldSearch("anna rossi"))).toBe(true);
    expect(hay.includes(foldSearch("milano"))).toBe(true);
  });
});

describe("foldMatchRange", () => {
  it("returns offsets into the original text", () => {
    expect(foldMatchRange("Forlì", "forli")).toEqual([0, 5]);
    expect(foldMatchRange("Nicolò Bianchi", "BIANCHI")).toEqual([7, 14]);
    expect(foldMatchRange("Città di Castello", "citta")).toEqual([0, 5]);
  });

  it("keeps the ORIGINAL text intact when sliced with the range", () => {
    const text = "Corso a Forlì-Cesena";
    const [s, e] = foldMatchRange(text, "forli")!;
    expect(text.slice(s, e)).toBe("Forlì");
    expect(text.slice(0, s) + text.slice(s, e) + text.slice(e)).toBe(text);
  });

  it("keeps a trailing combining mark attached to the match (decomposed text)", () => {
    const text = "Forli\u0300 Cesena"; // "ì" as i + U+0300
    const [s, e] = foldMatchRange(text, "forli")!;
    expect(text.slice(s, e)).toBe("Forli\u0300");
  });

  it("is null for an empty query or a miss", () => {
    expect(foldMatchRange("Forlì", "")).toBeNull();
    expect(foldMatchRange("Forlì", "   ")).toBeNull();
    expect(foldMatchRange("Forlì", "milano")).toBeNull();
  });
});
