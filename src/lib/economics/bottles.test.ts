import { describe, it, expect } from "vitest";
import { bottlesForStudents, bottleCost, parseVolumeMl, type BottleDay } from "./bottles";

describe("parseVolumeMl", () => {
  it("reads the format from the Sake Company SKU suffix", () => {
    expect(parseVolumeMl(null, "S075-0720")).toBe(720);
    expect(parseVolumeMl(null, "SR01-0500")).toBe(500);
    expect(parseVolumeMl(null, "RS11-0750")).toBe(750);
    expect(parseVolumeMl(null, "XX-0300")).toBe(300);
  });
  it("falls back to the product name", () => {
    expect(parseVolumeMl("Akita Kaori 720ml", null)).toBe(720);
    expect(parseVolumeMl("Junmai 300 ml", "BSSA")).toBe(300);
  });
  it("returns null when the format is nowhere to be found or implausible", () => {
    expect(parseVolumeMl("Box Sake Explorer", "BSSA-0001")).toBe(null); // 1ml? no — suffix 0001 out of range
    expect(parseVolumeMl(null, null)).toBe(null);
    expect(parseVolumeMl("Sake senza formato", "ABC")).toBe(null);
  });
});

describe("bottlesForStudents — 48ml a persona, arrotondato in eccesso", () => {
  it("the owner's exact examples: 15 people → 720ml:1, 500ml:2, 300ml:3", () => {
    expect(bottlesForStudents(15, 720)).toBe(1);
    expect(bottlesForStudents(15, 500)).toBe(2);
    expect(bottlesForStudents(15, 300)).toBe(3);
  });
  it("unknown format behaves exactly like the historical 720ml rule", () => {
    expect(bottlesForStudents(0)).toBe(0);
    expect(bottlesForStudents(1)).toBe(1);
    expect(bottlesForStudents(14)).toBe(1);
    expect(bottlesForStudents(15)).toBe(1);
    expect(bottlesForStudents(16)).toBe(2);
    expect(bottlesForStudents(30)).toBe(2);
    expect(bottlesForStudents(31)).toBe(3);
    expect(bottlesForStudents(45)).toBe(3);
  });
  it("scales with the format", () => {
    expect(bottlesForStudents(30, 500)).toBe(3); // 1440ml / 500
    expect(bottlesForStudents(30, 300)).toBe(5); // 1440ml / 300
    expect(bottlesForStudents(10, 1800)).toBe(1); // magnum
    expect(bottlesForStudents(1, 300)).toBe(1);
  });
  it("clamps a negative count to 0", () => {
    expect(bottlesForStudents(-5)).toBe(0);
    expect(bottlesForStudents(-5, 300)).toBe(0);
  });
});

describe("bottleCost — per-SKU bottles, format-aware", () => {
  it("uses the live catalog cost and the catalog name's format per SKU", () => {
    const days: BottleDay[] = [
      { sakes: [{ code: "A", cost: 10 }, { code: "B", cost: 8 }] },
      { sakes: [{ code: "C", cost: 5 }] },
    ];
    const cat = new Map([
      ["A", { cost: 20, name: "Sake A 720ml" }],
      ["B", { cost: 8, name: "Sake B 500ml" }],
      ["C", { cost: 5, name: "Sake C 300ml" }],
    ]);
    // 15 people: A→1×20, B→2×8, C→3×5 = 20+16+15 = 51
    expect(bottleCost(days, cat, 15)).toBe(51);
  });

  it("reads the format from the sake's own code when not in the catalog", () => {
    const cost = bottleCost([{ sakes: [{ code: "SR01-0500", cost: 7 }] }], new Map(), 15);
    expect(cost).toBe(14); // 2 bottles × 7
  });

  it("falls back to 720ml (historical behaviour) when the format is unknown", () => {
    const cost = bottleCost([{ sakes: [{ cost: 12 }] }], new Map(), 45);
    expect(cost).toBe(36); // 3 × 12, same as before
  });

  it("is 0 when there are no students", () => {
    const days: BottleDay[] = [{ sakes: [{ code: "A", cost: 10 }] }];
    expect(bottleCost(days, new Map(), 0)).toBe(0);
  });
});
