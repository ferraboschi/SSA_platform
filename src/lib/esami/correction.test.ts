import { describe, it, expect } from "vitest";
import {
  buildCorrectionDraft,
  verdictFromPct,
  type CorrectionAnswer,
  type OpenAnswerResult,
  type QuestionMeta,
} from "./correction";

const ans = (over: Partial<CorrectionAnswer> & { qid: string }): CorrectionAnswer => ({
  type: "single",
  text: `Domanda ${over.qid}`,
  given: "—",
  correct: "—",
  ok: null,
  ...over,
});

const graded = (over: Partial<OpenAnswerResult> = {}): OpenAnswerResult => ({
  points: 0,
  confidence: 0.5,
  rationale: "Motivazione.",
  grounded: true,
  citedTitles: ["Cap. 1"],
  failed: false,
  provider: "model",
  ...over,
});

const build = (
  answers: CorrectionAnswer[],
  meta: Record<string, QuestionMeta> = {},
  open: Record<string, OpenAnswerResult> = {},
) =>
  buildCorrectionDraft({
    submission: { id: 7, studentName: "Aiko Tanaka", studentEmail: "aiko@example.com" },
    answers,
    questionMeta: new Map(Object.entries(meta)),
    openResults: new Map(Object.entries(open)),
    at: "2026-07-04T10:00:00.000Z",
  });

describe("verdictFromPct — round to integer THEN compare to thresholds", () => {
  it("80 → passed", () => expect(verdictFromPct(80)).toBe("passed"));
  it("79.5 rounds to 80 → passed", () => expect(verdictFromPct(79.5)).toBe("passed"));
  it("79.4 rounds to 79 → retrial (not failed)", () => expect(verdictFromPct(79.4)).toBe("retrial"));
  it("70 → retrial", () => expect(verdictFromPct(70)).toBe("retrial"));
  it("69.5 rounds to 70 → retrial", () => expect(verdictFromPct(69.5)).toBe("retrial"));
  it("69.4 rounds to 69 → failed", () => expect(verdictFromPct(69.4)).toBe("failed"));
  it("0 → failed", () => expect(verdictFromPct(0)).toBe("failed"));
});

describe("buildCorrectionDraft — mixed exam", () => {
  // Objective right + wrong (incl. an important one), a model-graded open, a
  // blank open with NO grading result, a stub-graded fill, and a match question
  // (ok===null, no key) — batch 15: it now enters the AI/open lane and, lacking
  // a grading result here, counts as a failed 0-point open grade (never ignored).
  const answers = [
    ans({ qid: "q1", ok: true, given: "Junmai", correct: "Junmai" }),
    ans({ qid: "q2", ok: false, given: "Honjozo", correct: "Ginjo" }),
    ans({ qid: "q3", type: "truefalse", ok: false, given: "Vero", correct: "Falso" }),
    ans({ qid: "q4", type: "open", given: "Il koji trasforma l'amido in zuccheri." }),
    ans({ qid: "q5", type: "open", given: "—" }),
    ans({ qid: "q6", type: "fill", given: "kimoto" }),
    ans({ qid: "q7", type: "match", given: "A-1, B-2" }),
  ];
  const meta: Record<string, QuestionMeta> = {
    q1: { points: 1, important: false },
    q2: { points: 2, important: true },
    q3: { points: 1, important: false },
    q4: { points: 3, important: false },
    q5: { points: 3, important: false },
    q6: { points: 1, important: false },
    q7: { points: 2, important: false },
  };
  const open: Record<string, OpenAnswerResult> = {
    q4: graded({ points: 2.5, confidence: 0.8, citedTitles: ["Cap. 3"] }),
    q6: graded({ points: 0.5, confidence: 0.35, provider: "stub", grounded: false, citedTitles: [] }),
  };
  const d = build(answers, meta, open);

  it("sums the objective lane by points (earned = ok===true, max = ok!==null)", () => {
    expect(d.totals.objectiveEarned).toBe(1);
    expect(d.totals.objectiveMax).toBe(4);
  });
  it("sums the open lane over EVERY ok===null answer — keyless/match now included", () => {
    expect(d.totals.openEarned).toBe(3); // 2.5 + 0 (blank) + 0.5 + 0 (match, ungraded)
    expect(d.totals.openMax).toBe(9); // 3 + 3 + 1 + 2 (q7's points now count)
    expect(d.totals.max).toBe(13);
    expect(d.totals.earned).toBe(4);
  });
  it("computes combinedPct rounded and the verdict from it", () => {
    expect(d.combinedPct).toBe(31); // round(100 * 4 / 13)
    expect(d.verdict).toBe("failed");
  });
  it("computes objectivePct count-based, like the live auto-corrector", () => {
    expect(d.objectivePct).toBe(33); // round(100 * 1 / 3)
  });
  it("lists wrong objective answers important-first", () => {
    expect(d.wrongAnswers.map((w) => w.qid)).toEqual(["q2", "q3"]);
    expect(d.wrongAnswers[0]).toMatchObject({ important: true, points: 2, correct: "Ginjo" });
  });
  it("produces one OpenGrade per ok===null answer, in input order", () => {
    expect(d.openGrades.map((g) => g.qid)).toEqual(["q4", "q5", "q6", "q7"]);
    expect(d.openGrades[0]).toMatchObject({
      points: 2.5,
      maxPoints: 3,
      confidence: 0.8,
      grounded: true,
      citedTitles: ["Cap. 3"],
      failed: false,
    });
  });
  it("marks answers with no grading result as failed with 0 points", () => {
    expect(d.openGrades[1]).toMatchObject({ qid: "q5", points: 0, confidence: 0, failed: true });
    expect(d.openGrades[3]).toMatchObject({ qid: "q7", points: 0, failed: true });
    expect(d.totals.openFailed).toBe(2); // q5 (blank) + q7 (match, no result)
  });
  it("reports provider 'model' when any answer was model-graded", () => {
    expect(d.aiProvider).toBe("model");
  });
  it("carries the submission identity and the run timestamp", () => {
    expect(d.submissionId).toBe(7);
    expect(d.studentName).toBe("Aiko Tanaka");
    expect(d.studentEmail).toBe("aiko@example.com");
    expect(d.at).toBe("2026-07-04T10:00:00.000Z");
  });
});

describe("buildCorrectionDraft — threshold edges on the combined score", () => {
  it("8/10 objective → 80 → passed", () => {
    const answers = Array.from({ length: 10 }, (_, i) => ans({ qid: `q${i}`, ok: i < 8 }));
    const d = build(answers);
    expect(d.combinedPct).toBe(80);
    expect(d.verdict).toBe("passed");
  });
  it("79.4% rounds to 79 → retrial, not failed", () => {
    const answers = [ans({ qid: "o1", type: "open", given: "Risposta" })];
    const d = build(
      answers,
      { o1: { points: 10, important: false } },
      { o1: graded({ points: 7.94 }) },
    );
    expect(d.combinedPct).toBe(79);
    expect(d.verdict).toBe("retrial");
  });
  it("69.4% rounds to 69 → failed", () => {
    const answers = [ans({ qid: "o1", type: "open", given: "Risposta" })];
    const d = build(
      answers,
      { o1: { points: 10, important: false } },
      { o1: graded({ points: 6.94 }) },
    );
    expect(d.combinedPct).toBe(69);
    expect(d.verdict).toBe("failed");
  });
});

describe("buildCorrectionDraft — guards", () => {
  it("zero questions → 0%, failed, empty report (no division by zero)", () => {
    const d = build([]);
    expect(d.combinedPct).toBe(0);
    expect(d.objectivePct).toBe(0);
    expect(d.verdict).toBe("failed");
    expect(d.aiProvider).toBe("none");
    expect(d.openGrades).toEqual([]);
    expect(d.wrongAnswers).toEqual([]);
    expect(d.totals).toEqual({
      earned: 0,
      max: 0,
      objectiveEarned: 0,
      objectiveMax: 0,
      openEarned: 0,
      openMax: 0,
      openFailed: 0,
    });
  });
  it("missing openResults entry → failed grade with 0 points and manual-review rationale", () => {
    const d = build([ans({ qid: "o1", type: "open", given: "Testo" })], {
      o1: { points: 3, important: false },
    });
    expect(d.openGrades).toHaveLength(1);
    expect(d.openGrades[0]).toMatchObject({ points: 0, maxPoints: 3, failed: true, grounded: false });
    expect(d.openGrades[0].rationale).toMatch(/revisione manuale/i);
    expect(d.totals.openFailed).toBe(1);
    expect(d.aiProvider).toBe("none");
  });
  it("failed grading result → 0 points even if the backend reported some", () => {
    const d = build(
      [ans({ qid: "o1", type: "open", given: "Testo" })],
      { o1: { points: 3, important: false } },
      { o1: graded({ points: 2, confidence: 0.9, failed: true, provider: undefined }) },
    );
    expect(d.openGrades[0]).toMatchObject({ points: 0, confidence: 0, failed: true });
    expect(d.totals.openEarned).toBe(0);
    expect(d.aiProvider).toBe("none"); // failed calls never define the provider mix
  });
  it("clamps AI points into [0, maxPoints]", () => {
    const answers = [
      ans({ qid: "hi", type: "open", given: "A" }),
      ans({ qid: "lo", type: "open", given: "B" }),
    ];
    const d = build(
      answers,
      { hi: { points: 3, important: false }, lo: { points: 3, important: false } },
      { hi: graded({ points: 99 }), lo: graded({ points: -1 }) },
    );
    expect(d.openGrades[0].points).toBe(3);
    expect(d.openGrades[1].points).toBe(0);
    expect(d.totals.openEarned).toBe(3);
  });
  it("reports provider 'stub' when only the heuristic graded", () => {
    const d = build(
      [ans({ qid: "o1", type: "open", given: "Testo" })],
      { o1: { points: 3, important: false } },
      { o1: graded({ points: 1, provider: "stub" }) },
    );
    expect(d.aiProvider).toBe("stub");
  });
  it("sorts wrong answers important-first, then by points desc", () => {
    const answers = [
      ans({ qid: "a", ok: false }),
      ans({ qid: "b", ok: false }),
      ans({ qid: "c", ok: false }),
    ];
    const d = build(answers, {
      a: { points: 3, important: false },
      b: { points: 1, important: true },
      c: { points: 5, important: false },
    });
    expect(d.wrongAnswers.map((w) => w.qid)).toEqual(["b", "c", "a"]);
  });
  it("defaults unknown question meta to 1 point, not important", () => {
    const d = build([ans({ qid: "ghost", ok: false })]);
    expect(d.totals.objectiveMax).toBe(1);
    expect(d.wrongAnswers[0]).toMatchObject({ points: 1, important: false });
  });

  // Owner batch 15: a CHOICE question whose answer key was left empty grades to
  // ok===null; it must be AI-graded and its points COUNTED (never left "in
  // valutazione", never silently dropped from the total).
  it("scores a keyless multi via the AI open lane and counts its points", () => {
    const d = build(
      [ans({ qid: "water", type: "multi", ok: null, given: "Ferro, Solfato" })],
      { water: { points: 2, important: false } },
      { water: graded({ points: 1, vote: 3, confidence: 0.7 }) }, // ~50%
    );
    expect(d.openGrades.map((g) => g.qid)).toEqual(["water"]);
    expect(d.openGrades[0]).toMatchObject({ points: 1, maxPoints: 2, vote: 3, failed: false });
    expect(d.totals.openMax).toBe(2);
    expect(d.totals.openEarned).toBe(1);
    expect(d.combinedPct).toBe(50); // 1 / 2
  });
});
