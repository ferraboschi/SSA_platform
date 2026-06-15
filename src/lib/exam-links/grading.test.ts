import { describe, it, expect } from "vitest";
import {
  gradeObjective,
  fmtGiven,
  scoreToOutcome,
  isObjective,
  gradeAnswers,
  certifiedScore,
  type GradableQuestion,
} from "./grading";

const q = (over: Partial<GradableQuestion> & { id: string }): GradableQuestion => ({
  type: "single",
  text: "Q",
  options: [],
  ...over,
});

describe("isObjective", () => {
  it("auto-grades choice types, sends the rest to manual", () => {
    for (const t of ["single", "multi", "truefalse", "image"]) expect(isObjective(t)).toBe(true);
    for (const t of ["open", "match", "order", "fill"]) expect(isObjective(t)).toBe(false);
  });
});

describe("gradeObjective — single choice", () => {
  const single = q({ id: "1", type: "single", options: ["Junmai", "Honjozo", "Ginjo"], correct: [1] });

  it("matches the correct option TEXT (how the runner stores answers)", () => {
    expect(gradeObjective("Honjozo", single)).toBe(true);
  });
  it("is case- and whitespace-insensitive", () => {
    expect(gradeObjective("  honjozo ", single)).toBe(true);
  });
  it("also accepts a legacy stored INDEX", () => {
    expect(gradeObjective("1", single)).toBe(true);
  });
  it("rejects a wrong option", () => {
    expect(gradeObjective("Junmai", single)).toBe(false);
  });
  it("rejects an empty answer", () => {
    expect(gradeObjective("", single)).toBe(false);
    expect(gradeObjective([], single)).toBe(false);
    expect(gradeObjective(undefined, single)).toBe(false);
  });
  it("does NOT let a wrong numeric-text option collide with the correct index", () => {
    // options whose TEXT is a number; correct is "5" (index 1). Picking "1" (a WRONG
    // option's text) must not slip through the legacy index path as if it were index 1.
    const numeric = q({ id: "n", type: "single", options: ["1", "5", "7"], correct: [1] });
    expect(gradeObjective("5", numeric)).toBe(true); // correct option text
    expect(gradeObjective("1", numeric)).toBe(false); // wrong text that equals the correct index
  });
});

describe("gradeObjective — multi choice (order-independent, exact set)", () => {
  const multi = q({ id: "2", type: "multi", options: ["Acidità", "Dolcezza", "Umami"], correct: [0, 2] });

  it("accepts the exact set regardless of order", () => {
    expect(gradeObjective(["Acidità", "Umami"], multi)).toBe(true);
    expect(gradeObjective(["Umami", "Acidità"], multi)).toBe(true);
  });
  it("rejects a partial answer (missing one)", () => {
    expect(gradeObjective(["Acidità"], multi)).toBe(false);
  });
  it("rejects extra selections", () => {
    expect(gradeObjective(["Acidità", "Dolcezza", "Umami"], multi)).toBe(false);
  });
});

describe("gradeObjective — truefalse & image", () => {
  it("truefalse grades the chosen option", () => {
    const tf = q({ id: "3", type: "truefalse", options: ["Vero", "Falso"], correct: [0] });
    expect(gradeObjective("Vero", tf)).toBe(true);
    expect(gradeObjective("Falso", tf)).toBe(false);
  });
  it("image (identify) grades like a single choice", () => {
    const img = q({ id: "4", type: "image", options: ["Tokkuri", "Ochoko"], correct: [1] });
    expect(gradeObjective("Ochoko", img)).toBe(true);
    expect(gradeObjective("Tokkuri", img)).toBe(false);
  });
});

describe("fmtGiven", () => {
  const opt = q({ id: "5", options: ["A", "B", "C"] });
  it("renders the chosen text", () => expect(fmtGiven("B", opt)).toBe("B"));
  it("maps a legacy numeric index back to its option text", () => expect(fmtGiven("2", opt)).toBe("C"));
  it("joins multi answers", () => expect(fmtGiven(["A", "C"], opt)).toBe("A, C"));
  it("returns the raw text when there are no options (open/fill)", () =>
    expect(fmtGiven("testo libero", q({ id: "6", options: [] }))).toBe("testo libero"));
  it("shows an em-dash for an empty answer", () => {
    expect(fmtGiven(undefined, opt)).toBe("—");
    expect(fmtGiven([], opt)).toBe("—");
  });
});

describe("scoreToOutcome — SSA thresholds (pass ≥80, retrial ≥70)", () => {
  it("passes at and above 80", () => {
    expect(scoreToOutcome(100)).toBe("passed");
    expect(scoreToOutcome(80)).toBe("passed");
  });
  it("retrial in [70, 80)", () => {
    expect(scoreToOutcome(79)).toBe("retrial");
    expect(scoreToOutcome(70)).toBe("retrial");
  });
  it("fails below 70", () => {
    expect(scoreToOutcome(69)).toBe("failed");
    expect(scoreToOutcome(0)).toBe("failed");
  });
});

describe("gradeAnswers — fill (Riempi spazio)", () => {
  it("auto-grades a typed answer against the accepted strings, case-insensitively", () => {
    const fill = q({ id: "f1", type: "fill", correct: ["Yamada Nishiki", "Omachi"] });
    const r = gradeAnswers([fill], { f1: "yamada nishiki" });
    expect(r.gradable).toBe(1);
    expect(r.correct).toBe(1);
    expect(r.detail[0].ok).toBe(true);
  });
  it("marks a wrong fill answer incorrect (still gradable)", () => {
    const fill = q({ id: "f2", type: "fill", correct: ["Gohyakumangoku"] });
    const r = gradeAnswers([fill], { f2: "Yamada Nishiki" });
    expect(r.gradable).toBe(1);
    expect(r.correct).toBe(0);
    expect(r.detail[0].ok).toBe(false);
  });
  it("sends a fill with NO accepted answers to manual review", () => {
    const fill = q({ id: "f3", type: "fill", correct: [] });
    const r = gradeAnswers([fill], { f3: "qualcosa" });
    expect(r.gradable).toBe(0);
    expect(r.manual).toBe(1);
    expect(r.detail[0].ok).toBeNull();
  });
  it("marks an empty fill answer wrong (not manual)", () => {
    const fill = q({ id: "f4", type: "fill", correct: ["Sakè"] });
    const r = gradeAnswers([fill], { f4: "" });
    expect(r.detail[0].ok).toBe(false);
  });
});

describe("gradeAnswers — manual-review types", () => {
  it("open / match / order are never auto-graded", () => {
    const qs = [
      q({ id: "o", type: "open", text: "Descrivi il junmai" }),
      q({ id: "m", type: "match", text: "Abbina" }),
      q({ id: "r", type: "order", text: "Ordina" }),
    ];
    const res = gradeAnswers(qs, { o: "una risposta", m: "x", r: "y" });
    expect(res.gradable).toBe(0);
    expect(res.manual).toBe(3);
    expect(res.detail.every((d) => d.ok === null)).toBe(true);
  });
  it("a choice question with NO answer key falls back to manual", () => {
    const r = gradeAnswers([q({ id: "s", type: "single", options: ["A", "B"] })], { s: "A" });
    expect(r.manual).toBe(1);
    expect(r.gradable).toBe(0);
    expect(r.detail[0].ok).toBeNull();
  });
});

describe("gradeAnswers — whole submission scoring", () => {
  const mixed: GradableQuestion[] = [
    q({ id: "a", type: "single", options: ["X", "Y"], correct: [0] }), // correct
    q({ id: "b", type: "single", options: ["X", "Y"], correct: [1] }), // wrong
    q({ id: "c", type: "fill", correct: ["Sakè"] }), // correct
    q({ id: "d", type: "open", text: "aperta" }), // manual
  ];

  it("counts gradable/correct/manual and computes the auto score", () => {
    const r = gradeAnswers(mixed, { a: "X", b: "X", c: "sakè", d: "qualcosa" });
    expect(r.gradable).toBe(3);
    expect(r.correct).toBe(2);
    expect(r.manual).toBe(1);
    expect(r.autoScore).toBe(67); // round(2/3*100)
    expect(r.suggested).toBe("failed"); // 67 < 70
    expect(r.detail).toHaveLength(4);
  });

  it("a perfect objective run is 100 → passed", () => {
    const r = gradeAnswers(
      [
        q({ id: "a", type: "single", options: ["X", "Y"], correct: [0] }),
        q({ id: "b", type: "truefalse", options: ["Vero", "Falso"], correct: [0] }),
      ],
      { a: "X", b: "Vero" },
    );
    expect(r.autoScore).toBe(100);
    expect(r.suggested).toBe("passed");
  });

  it("4/5 correct is exactly 80 → passed (boundary)", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      q({ id: `q${i}`, type: "single", options: ["X", "Y"], correct: [0] }),
    );
    // first 4 right, last wrong
    const answers = { q0: "X", q1: "X", q2: "X", q3: "X", q4: "Y" };
    const r = gradeAnswers(five, answers);
    expect(r.autoScore).toBe(80);
    expect(r.suggested).toBe("passed");
  });

  it("a fully-manual submission scores 0 (no gradable) and is not falsely 'failed' on a real %", () => {
    const r = gradeAnswers([q({ id: "o", type: "open" })], { o: "x" });
    expect(r.gradable).toBe(0);
    expect(r.autoScore).toBe(0);
    expect(r.suggested).toBe("failed"); // 0 < 70 — display layer treats gradable=0 specially
  });

  it("treats a missing answer as wrong (not a crash)", () => {
    const r = gradeAnswers([q({ id: "a", type: "single", options: ["X", "Y"], correct: [0] })], {});
    expect(r.gradable).toBe(1);
    expect(r.correct).toBe(0);
    expect(r.detail[0].given).toBe("—");
  });

  it("handles null/empty answers object", () => {
    const r = gradeAnswers([], null);
    expect(r).toMatchObject({ gradable: 0, correct: 0, manual: 0, autoScore: 0, suggested: "failed" });
    expect(r.detail).toHaveLength(0);
  });
});

describe("certifiedScore (the % to store/show next to the outcome)", () => {
  it("is null when there are no auto-gradable questions (all-manual exam) — never a fake 0%", () => {
    expect(certifiedScore(0, 0, "passed")).toBeNull();
    expect(certifiedScore(0, 0, "retrial")).toBeNull();
    expect(certifiedScore(0, 0, "failed")).toBeNull();
  });

  it("is the auto score when the operator confirms the auto-suggested outcome", () => {
    expect(certifiedScore(10, 85, "passed")).toBe(85); // 85 ⇒ passed
    expect(certifiedScore(10, 75, "retrial")).toBe(75); // 75 ⇒ retrial
    expect(certifiedScore(10, 40, "failed")).toBe(40); // 40 ⇒ failed
  });

  it("is null when the operator overrides against the auto-suggestion — never 'Bocciato 85%'", () => {
    expect(certifiedScore(10, 85, "failed")).toBeNull(); // would read "Bocciato 85%"
    expect(certifiedScore(10, 40, "passed")).toBeNull(); // would read "Promosso 40%"
    expect(certifiedScore(10, 75, "passed")).toBeNull(); // retrial-range bumped to passed
  });

  it("agrees with scoreToOutcome at the threshold boundaries", () => {
    expect(certifiedScore(5, 80, "passed")).toBe(80); // exactly pass
    expect(certifiedScore(5, 70, "retrial")).toBe(70); // exactly retrial
    expect(certifiedScore(5, 69, "failed")).toBe(69); // just below retrial
  });
});
