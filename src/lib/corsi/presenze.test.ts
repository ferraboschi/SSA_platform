import { describe, it, expect } from "vitest";
import {
  countCourseDays,
  presenceCountsByDay,
  presenceLabel,
  presentDaysByCorsista,
  presentDaysFromMap,
} from "./presenze";

describe("presenze — sums only, never a gate", () => {
  it("collects the present days per corsista (sorted, unique, absent rows ignored)", () => {
    const m = presentDaysByCorsista([
      { corsista_id: 1, day_no: 2, present: true },
      { corsista_id: 1, day_no: 1, present: true },
      { corsista_id: 1, day_no: 3, present: false },
      { corsista_id: 2, day_no: 1, present: true },
      { corsista_id: null, day_no: 1, present: true }, // a companion row
      { corsista_id: 1, day_no: 2, present: true }, // duplicate
    ]);
    expect(m.get(1)).toEqual([1, 2]);
    expect(m.get(2)).toEqual([1]);
    expect(m.has(3)).toBe(false);
  });
  it("reads the live roll-call map bounded to maxDay", () => {
    expect(presentDaysFromMap({ 1: true, 2: false, 3: true, 4: true, 9: true }, 4)).toEqual([1, 3, 4]);
    expect(presentDaysFromMap(undefined, 3)).toEqual([]);
  });
  it("counts course days only (exam day excluded) and labels the exam day separately", () => {
    expect(countCourseDays([1, 2, 4], 3)).toBe(2);
    expect(presenceLabel([1, 2, 4], 3, 4)).toBe("2/3 + esame");
    expect(presenceLabel([1, 2, 3], 3, 4)).toBe("3/3");
    expect(presenceLabel([], 3, null)).toBe("0/3");
  });
  it("sums presences per day across the roster", () => {
    const c = presenceCountsByDay([[1, 2], [1], [2, 3], []], 3);
    expect([...c.entries()]).toEqual([[1, 2], [2, 2], [3, 1]]);
  });
});
