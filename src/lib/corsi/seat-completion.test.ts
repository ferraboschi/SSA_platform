import { describe, it, expect } from "vitest";
import { phoneLooksValid, planRekey } from "./seat-completion";

describe("phoneLooksValid", () => {
  it("accepts real numbers with common formatting", () => {
    expect(phoneLooksValid("3331234567")).toBe(true);
    expect(phoneLooksValid("+39 333 123 4567")).toBe(true);
    expect(phoneLooksValid("(02) 1234-567")).toBe(true);
  });
  it("rejects garbage and too-short input (owner: 'dd' must be rejected)", () => {
    expect(phoneLooksValid("dd")).toBe(false);
    expect(phoneLooksValid("12345")).toBe(false);
    expect(phoneLooksValid("")).toBe(false);
    expect(phoneLooksValid("333 abc 4567")).toBe(false);
  });
});

describe("planRekey (placeholder → existing corsista, before the placeholder is deleted)", () => {
  it("moves every row whose key the target does not hold", () => {
    const plan = planRekey(
      [
        { id: 11, key: "1", present: true },
        { id: 12, key: "2", present: false },
      ],
      [],
    );
    expect(plan).toEqual({ move: [11, 12], markPresent: [] });
  });

  it("on a key conflict leaves the placeholder row in place and folds present=true onto the target", () => {
    const plan = planRekey(
      [
        { id: 11, key: "1", present: true }, // conflict, target absent → target becomes present
        { id: 12, key: "2", present: true }, // conflict, target already present → nothing
        { id: 13, key: "3", present: false }, // conflict, placeholder absent → nothing
        { id: 14, key: "4", present: true }, // no conflict → moves
      ],
      [
        { id: 21, key: "1", present: false },
        { id: 22, key: "2", present: true },
        { id: 23, key: "3", present: false },
      ],
    );
    expect(plan).toEqual({ move: [14], markPresent: [21] });
  });

  it("never marks the same target row twice", () => {
    const plan = planRekey(
      [
        { id: 11, key: "1", present: true },
        { id: 12, key: "1", present: true },
      ],
      [{ id: 21, key: "1", present: false }],
    );
    expect(plan).toEqual({ move: [], markPresent: [21] });
  });

  it("tables without a presence fact (exam_progress) only move non-conflicting rows", () => {
    const plan = planRekey(
      [
        { id: 31, key: "day1" },
        { id: 32, key: "final" },
      ],
      [{ id: 41, key: "final" }],
    );
    expect(plan).toEqual({ move: [31], markPresent: [] });
  });

  it("is a no-op with nothing to move", () => {
    expect(planRekey([], [{ id: 1, key: "1", present: true }])).toEqual({ move: [], markPresent: [] });
  });
});
