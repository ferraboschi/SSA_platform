import { describe, it, expect } from "vitest";
import { bottlesForStudents, bottleCost, type BottleDay } from "./bottles";

describe("bottlesForStudents", () => {
  it("one bottle covers ~15 students, rounding up, min 1 once there's a student", () => {
    expect(bottlesForStudents(0)).toBe(0);
    expect(bottlesForStudents(1)).toBe(1);
    expect(bottlesForStudents(14)).toBe(1);
    expect(bottlesForStudents(15)).toBe(1);
    expect(bottlesForStudents(16)).toBe(2);
    expect(bottlesForStudents(30)).toBe(2);
    expect(bottlesForStudents(31)).toBe(3);
    expect(bottlesForStudents(45)).toBe(3);
  });
  it("clamps a negative count to 0", () => {
    expect(bottlesForStudents(-5)).toBe(0);
  });
});

describe("bottleCost", () => {
  const days: BottleDay[] = [
    { sakes: [{ code: "A", cost: 10 }, { code: "B", cost: 8 }] },
    { sakes: [{ code: "C", cost: 5 }] },
  ];

  it("uses the live catalog cost when the SKU is present, times bottlesPerSku", () => {
    const cat = new Map([
      ["A", { cost: 20 }],
      ["B", { cost: 8 }],
      ["C", { cost: 5 }],
    ]);
    // bottlesPerSku=2 → 2*(20 + 8) + 2*(5) = 56 + 10 = 66
    expect(bottleCost(days, cat, 2)).toBe(66);
  });

  it("falls back to the stored per-sake cost when the SKU has no code", () => {
    const cost = bottleCost([{ sakes: [{ cost: 12 }] }], new Map(), 3);
    expect(cost).toBe(36); // 3 * 12
  });

  it("falls back to the stored cost when the code isn't in the catalog", () => {
    const cost = bottleCost([{ sakes: [{ code: "X", cost: 7 }] }], new Map(), 2);
    expect(cost).toBe(14); // 2 * 7 (X not in catalog)
  });

  it("is 0 when there are no bottles", () => {
    expect(bottleCost(days, new Map(), 0)).toBe(0);
  });
});
