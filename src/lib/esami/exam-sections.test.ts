import { describe, it, expect } from "vitest";
import {
  computeSections,
  weakAreas,
  PASS_PCT,
  type SectionDetail,
  type SectionQMeta,
  type SectionOpenGrade,
} from "./exam-sections";

const meta = (entries: Record<string, SectionQMeta>) => new Map(Object.entries(entries));
const open = (entries: Record<string, SectionOpenGrade>) => new Map(Object.entries(entries));

describe("computeSections — bucket settled scores by category", () => {
  const qMeta = meta({
    q1: { points: 2, cat: "Storia" },
    q2: { points: 1, cat: "Storia" },
    q3: { points: 3, cat: "Produzione" },
    q4: { points: 2, cat: "Produzione" }, // open (ok===null)
  });

  it("weights by points and gives MULTI its partial share", () => {
    const detail: SectionDetail[] = [
      { qid: "q1", ok: true }, // 2 / 2
      { qid: "q2", ok: false, fraction: 0.5 }, // 0.5 / 1
      { qid: "q3", ok: false, fraction: 0 }, // 0 / 3
      { qid: "q4", ok: null }, // open, graded below
    ];
    const secs = computeSections(detail, qMeta, open({ q4: { points: 1.5, failed: false } }));
    expect(secs).toEqual([
      { name: "Storia", pct: 83 }, // round(100 * 2.5 / 3)
      { name: "Produzione", pct: 30 }, // round(100 * 1.5 / 5)
    ]);
  });

  it("drops an open answer with NO grade — it neither earns nor inflates the max", () => {
    const detail: SectionDetail[] = [
      { qid: "q3", ok: true }, // 3 / 3
      { qid: "q4", ok: null }, // open, ungraded → excluded entirely
    ];
    const secs = computeSections(detail, qMeta, open({}));
    expect(secs).toEqual([{ name: "Produzione", pct: 100 }]); // q4 not in the max
  });

  it("drops an open answer whose AI grade FAILED (never a 0-point deflation)", () => {
    const detail: SectionDetail[] = [
      { qid: "q3", ok: true },
      { qid: "q4", ok: null },
    ];
    const secs = computeSections(detail, qMeta, open({ q4: { points: 0, failed: true } }));
    expect(secs).toEqual([{ name: "Produzione", pct: 100 }]);
  });

  it("counts a blank (ok===false, fraction 0) at full weight in the denominator", () => {
    const detail: SectionDetail[] = [
      { qid: "q1", ok: true }, // 2 / 2
      { qid: "q2", ok: false, fraction: 0 }, // 0 / 1 (blank)
    ];
    const secs = computeSections(detail, qMeta, open({}));
    expect(secs).toEqual([{ name: "Storia", pct: 67 }]); // round(100 * 2 / 3)
  });

  it("ignores answers whose question meta is unknown (template edited)", () => {
    const detail: SectionDetail[] = [
      { qid: "q1", ok: true },
      { qid: "ghost", ok: false, fraction: 0 },
    ];
    const secs = computeSections(detail, qMeta, open({}));
    expect(secs).toEqual([{ name: "Storia", pct: 100 }]);
  });

  it("clamps an AI open grade into [0, points]", () => {
    const detail: SectionDetail[] = [{ qid: "q4", ok: null }];
    const over = computeSections(detail, qMeta, open({ q4: { points: 99, failed: false } }));
    expect(over).toEqual([{ name: "Produzione", pct: 100 }]); // clamped to 2/2
  });
});

describe("weakAreas — which areas to name, and the lead sentence", () => {
  it("passed with every area at/above the threshold → 'strong', names only the lowest", () => {
    const w = weakAreas([{ name: "A", pct: 100 }, { name: "B", pct: 85 }], "passed");
    expect(w).toEqual({ leadKey: "strong", items: [{ name: "B", pct: 85 }] });
  });

  it("passed with weak areas → verdict lead, weakest-first", () => {
    const w = weakAreas(
      [{ name: "A", pct: 90 }, { name: "B", pct: 62 }, { name: "C", pct: 70 }],
      "passed",
    );
    expect(w).toEqual({ leadKey: "passed", items: [{ name: "B", pct: 62 }, { name: "C", pct: 70 }] });
  });

  it("failed → lists sub-threshold areas ascending, capped at 3", () => {
    const w = weakAreas(
      [
        { name: "A", pct: 40 },
        { name: "B", pct: 55 },
        { name: "C", pct: 60 },
        { name: "D", pct: 68 },
        { name: "E", pct: 72 },
      ],
      "failed",
    );
    expect(w?.leadKey).toBe("failed");
    expect(w?.items.map((s) => s.name)).toEqual(["A", "B", "C"]); // 3 weakest
  });

  it("retrial with nothing below the threshold → defensively names the single lowest", () => {
    const w = weakAreas([{ name: "A", pct: 82 }, { name: "B", pct: 88 }], "retrial");
    expect(w).toEqual({ leadKey: "retrial", items: [{ name: "A", pct: 82 }] });
  });

  it("no sections → null (nothing to consolidate)", () => {
    expect(weakAreas([], "failed")).toBeNull();
  });

  it("uses the same 80% threshold as the grader", () => {
    expect(PASS_PCT).toBe(80);
  });
});
