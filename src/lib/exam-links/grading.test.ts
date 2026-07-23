import { describe, it, expect } from "vitest";
import {
  gradeObjective,
  fmtGiven,
  scoreToOutcome,
  isObjective,
  gradeAnswers,
  certifiedScore,
  isCorrectSubset,
  splitAccepted,
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
  it("routes an ANSWERED non-matching fill to the AI (batch 21), not a hard fail", () => {
    // Owner batch 21: a paraphrase/more-complete typed answer isn't auto-failed —
    // it leaves the objective lane (ok=null) so the generous AI can grade it,
    // with the accepted answer carried along as the reference.
    const fill = q({ id: "f2", type: "fill", correct: ["Gohyakumangoku"] });
    const r = gradeAnswers([fill], { f2: "Yamada Nishiki" });
    expect(r.detail[0].ok).toBeNull(); // → AI lane, not a deterministic wrong
    expect(r.manual).toBe(1);
    expect(r.gradable).toBe(0); // no longer counted in the objective denominator
    expect(r.correct).toBe(0);
    expect(r.detail[0].correct).toBe("Gohyakumangoku"); // reference for the AI
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
  it("a choice question with an EMPTY answer key ([]) falls back to manual (not auto-wrong)", () => {
    const r = gradeAnswers([q({ id: "e", type: "single", options: ["A", "B"], correct: [] })], { e: "A" });
    expect(r.gradable).toBe(0);
    expect(r.manual).toBe(1);
    expect(r.detail[0].ok).toBeNull();
  });
  it("a 'chapter' communication slide is excluded from grading entirely", () => {
    const qs = [
      q({ id: "a", type: "single", options: ["X", "Y"], correct: [0] }),
      q({ id: "ch", type: "chapter", text: "Cambio capitolo", options: ["Qui parte il blind tasting"], points: 0 }),
      q({ id: "b", type: "single", options: ["X", "Y"], correct: [1] }),
    ];
    // Answer the two real questions correctly; the chapter is never answered.
    const r = gradeAnswers(qs, { a: "X", b: "Y" });
    expect(r.gradable).toBe(2); // only the two real questions count
    expect(r.manual).toBe(0);
    expect(r.autoScore).toBe(100); // the unanswered slide does NOT tank the score
    expect(r.detail.map((d) => d.qid)).toEqual(["a", "b"]); // slide absent from the answer list
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

describe("gradeAnswers — multilingual (student graded in the language they SAW)", () => {
  // The runner stores the student's answer as the TRANSLATED option text, so a
  // correct EN/JA submission must score 100% — not 0% against the Italian key.
  const multilingual = [
    q({
      id: "tf",
      type: "truefalse",
      options: ["Vero", "Falso"],
      correct: [0],
      i18n: { en: { text: "T/F", options: ["True", "False"] }, ja: { text: "?", options: ["正しい", "誤り"] } },
    }),
    q({
      id: "m",
      type: "multi",
      options: ["Acidità", "Dolcezza", "Umami"],
      correct: [0, 2],
      i18n: {
        en: { text: "", options: ["Acidity", "Sweetness", "Umami"] },
        ja: { text: "", options: ["酸味", "甘味", "うま味"] },
      },
    }),
  ];

  it("scores 100% for a correct ENGLISH submission (answers stored in English)", () => {
    const r = gradeAnswers(multilingual, { tf: ["True"], m: ["Acidity", "Umami"] }, "en");
    expect(r.gradable).toBe(2);
    expect(r.correct).toBe(2);
    expect(r.autoScore).toBe(100);
    expect(r.suggested).toBe("passed");
  });

  it("scores 100% for a correct JAPANESE submission", () => {
    const r = gradeAnswers(multilingual, { tf: ["正しい"], m: ["酸味", "うま味"] }, "ja");
    expect(r.autoScore).toBe(100);
    expect(r.suggested).toBe("passed");
  });

  it("still scores a correct Italian submission 100% (no lang / 'it')", () => {
    expect(gradeAnswers(multilingual, { tf: ["Vero"], m: ["Acidità", "Umami"] }, "it").autoScore).toBe(100);
    expect(gradeAnswers(multilingual, { tf: ["Vero"], m: ["Acidità", "Umami"] }).autoScore).toBe(100);
  });

  it("marks a WRONG English answer wrong (no false 100%)", () => {
    // "Sweetness" is NOT in the key {Acidity, Umami} — a genuine wrong pick, not
    // an "either/or" subset (which batch 17 would accept).
    const r = gradeAnswers(multilingual, { tf: ["False"], m: ["Sweetness"] }, "en");
    expect(r.correct).toBe(0);
  });

  it("falls back to Italian options when a translation is missing for that question", () => {
    const partial = [q({ id: "x", type: "single", options: ["Sì", "No"], correct: [0] })]; // no i18n
    // student in 'en' but saw Italian (no translation) → their answer is Italian
    expect(gradeAnswers(partial, { x: ["Sì"] }, "en").autoScore).toBe(100);
  });

  it("routes a TRANSLATED fill question to manual (no localized answer key)", () => {
    const fillQ = [q({ id: "f", type: "fill", options: [], correct: ["junmai"], i18n: { en: { text: "type", options: [] } } })];
    const r = gradeAnswers(fillQ, { f: "junmai" }, "en");
    expect(r.gradable).toBe(0);
    expect(r.manual).toBe(1);
  });

  it("still auto-grades an Italian fill question", () => {
    const fillQ = [q({ id: "f", type: "fill", options: [], correct: ["junmai"] })];
    const r = gradeAnswers(fillQ, { f: "Junmai" }, "it");
    expect(r.gradable).toBe(1);
    expect(r.correct).toBe(1);
  });
});

describe("gradeAnswers — order questions (batch 7: auto-graded by sequence)", () => {
  const order = q({
    id: "o1",
    type: "order",
    options: ["Ginjo", "Junmai", "Daiginjo"], // scrambled arrangement served
    correct: ["Junmai", "Ginjo", "Daiginjo"], // the true sequence (items)
  });

  it("exact sequence → correct, wrong sequence → wrong (all-or-nothing)", () => {
    const right = gradeAnswers([order], { o1: ["Junmai", "Ginjo", "Daiginjo"] });
    expect(right.gradable).toBe(1);
    expect(right.correct).toBe(1);
    expect(right.detail[0].ok).toBe(true);

    const wrong = gradeAnswers([order], { o1: ["Ginjo", "Junmai", "Daiginjo"] });
    expect(wrong.gradable).toBe(1);
    expect(wrong.correct).toBe(0);
    expect(wrong.detail[0].ok).toBe(false);
  });

  it("comparison is case/space-insensitive and shows the key as a chain", () => {
    const r = gradeAnswers([order], { o1: ["  junmai ", "GINJO", "daiginjo"] });
    expect(r.detail[0].ok).toBe(true);
    expect(r.detail[0].correct).toBe("Junmai → Ginjo → Daiginjo");
  });

  it("legacy free-text answers (textarea era) stay manual, never auto-failed", () => {
    const r = gradeAnswers([order], { o1: "junmai poi ginjo poi daiginjo" });
    expect(r.manual).toBe(1);
    expect(r.detail[0].ok).toBe(null);
  });

  it("no key (items never provided) → manual", () => {
    const noKey = q({ id: "o2", type: "order", options: ["A", "B"], correct: [] });
    const r = gradeAnswers([noKey], { o2: ["A", "B"] });
    expect(r.manual).toBe(1);
  });

  it("translated sitting grades against the translated sequence the student saw", () => {
    const tr = q({
      id: "o3",
      type: "order",
      options: ["Ginjo IT", "Junmai IT"], // scrambled (Italian)
      correct: ["Junmai IT", "Ginjo IT"],
      i18n: { en: { text: "Q EN", options: ["Ginjo EN", "Junmai EN"] } }, // aligned with options
    });
    const right = gradeAnswers([tr], { o3: ["Junmai EN", "Ginjo EN"] }, "en");
    expect(right.detail[0].ok).toBe(true);
    const wrong = gradeAnswers([tr], { o3: ["Ginjo EN", "Junmai EN"] }, "en");
    expect(wrong.detail[0].ok).toBe(false);
  });
});

// ── Batch 10 (owner): unanswered = wrong, MULTI partial credit ──────────────
describe("unanswered & partial credit (batch 10)", () => {
  const single = q({ id: "s1", type: "single", options: ["A", "B"], correct: [0] });
  const multi = q({
    id: "m1",
    type: "multi",
    options: ["A", "B", "C", "D"],
    correct: [0, 1, 2],
    points: 3,
  });
  const open = q({ id: "op1", type: "open", options: [], correct: [] });

  it("a blank answer is WRONG at full weight for every type — never manual", () => {
    const r = gradeAnswers([single, open], {});
    expect(r.gradable).toBe(2);
    expect(r.manual).toBe(0);
    expect(r.autoScore).toBe(0);
    for (const d of r.detail) {
      expect(d.ok).toBe(false);
      expect(d.unanswered).toBe(true);
      expect(d.given).toBe("—");
    }
  });

  it("a blank open never reaches the AI lane (ok !== null)", () => {
    const r = gradeAnswers([open], { op1: "   " });
    expect(r.detail[0].ok).toBe(false);
    expect(r.detail[0].unanswered).toBe(true);
  });

  it("multi: the exact set earns the full point", () => {
    const r = gradeAnswers([multi], { m1: ["A", "B", "C"] });
    expect(r.detail[0].ok).toBe(true);
    expect(r.detail[0].fraction).toBe(1);
    expect(r.autoScore).toBe(100);
  });

  it("multi: partial picks earn their share (2 right of 3 → 2/3)", () => {
    const r = gradeAnswers([multi], { m1: ["A", "B"] });
    expect(r.detail[0].ok).toBe(false);
    expect(r.detail[0].fraction).toBeCloseTo(2 / 3);
    expect(r.autoScore).toBe(67); // round(100 × 2/3)
  });

  it("multi: wrong picks subtract (2 right + 1 wrong of 3 → 1/3), floored at 0", () => {
    const r = gradeAnswers([multi], { m1: ["A", "B", "D"] });
    expect(r.detail[0].fraction).toBeCloseTo(1 / 3);
    const allWrong = gradeAnswers([multi], { m1: ["D"] });
    expect(allWrong.detail[0].fraction).toBe(0);
  });

  it("partial credit flows into the points-weighted autoScore", () => {
    // single (1pt) right + multi (3pt) at 2/3 → (1 + 2) / 4 = 75
    const r = gradeAnswers([single, multi], { s1: ["A"], m1: ["A", "B"] });
    expect(r.autoScore).toBe(75);
  });
});

// ── Batch 21 (owner): FILL accepted answers split on comma/semicolon/newline ──
describe("fill accepted answers — separator-robust", () => {
  it("splitAccepted breaks on comma, semicolon and newline, trims, drops empties", () => {
    expect(splitAccepted(["taruzake;taru-zake;taru"])).toEqual(["taruzake", "taru-zake", "taru"]);
    expect(splitAccepted(["a; b ,c\nd", "  ", "e"])).toEqual(["a", "b", "c", "d", "e"]);
    expect(splitAccepted([])).toEqual([]);
    expect(splitAccepted(undefined)).toEqual([]);
  });

  it("a key authored with semicolons accepts EACH variant (the taruzake bug)", () => {
    const taru = q({ id: "t", type: "fill", options: [], correct: ["taruzake;taru-zake;taru"] });
    expect(gradeAnswers([taru], { t: "taruzake" }).correct).toBe(1);
    expect(gradeAnswers([taru], { t: "TARU-ZAKE" }).correct).toBe(1); // case-insensitive
    expect(gradeAnswers([taru], { t: " taru " }).correct).toBe(1); // trimmed
    // A non-matching answer is no longer a hard fail — it goes to the AI (ok=null).
    expect(gradeAnswers([taru], { t: "sakè" }).detail[0].ok).toBeNull();
    // The correct-answer display is cleaned up too (semicolons → comma list).
    expect(gradeAnswers([taru], { t: "sakè" }).detail[0].correct).toBe("taruzake, taru-zake, taru");
  });
});

// ── Batch 17 (owner): MULTI "either / or / both" for a TWO-correct key ───────
describe("multi either/or/both — a two-correct key accepts any non-empty subset", () => {
  // "Il bouquet suggerisce honjozo O junmai?" — key {honjozo, junmai}.
  const bouquet = q({
    id: "b",
    type: "multi",
    options: ["Honjozo", "Junmai", "Ginjo"],
    correct: [0, 1],
    points: 2,
  });

  it("isCorrectSubset: one of the two correct options is a valid subset", () => {
    expect(isCorrectSubset(["Junmai"], bouquet)).toBe(true);
    expect(isCorrectSubset(["Honjozo"], bouquet)).toBe(true);
    expect(isCorrectSubset(["Honjozo", "Junmai"], bouquet)).toBe(true);
    expect(isCorrectSubset(["Ginjo"], bouquet)).toBe(false); // a wrong pick
    expect(isCorrectSubset(["Junmai", "Ginjo"], bouquet)).toBe(false); // one wrong
    expect(isCorrectSubset([], bouquet)).toBe(false); // empty
  });

  it("naming ONE of the two correct options scores full marks", () => {
    const r = gradeAnswers([bouquet], { b: ["Junmai"] });
    expect(r.detail[0].ok).toBe(true);
    expect(r.detail[0].fraction).toBe(1);
    expect(r.autoScore).toBe(100);
    expect(r.correct).toBe(1);
  });

  it("naming BOTH still scores full marks (unchanged)", () => {
    const r = gradeAnswers([bouquet], { b: ["Honjozo", "Junmai"] });
    expect(r.detail[0].ok).toBe(true);
    expect(r.autoScore).toBe(100);
  });

  it("a wrong pick is NOT accepted (falls back to partial credit)", () => {
    const r = gradeAnswers([bouquet], { b: ["Ginjo"] });
    expect(r.detail[0].ok).toBe(false);
    expect(r.detail[0].fraction).toBe(0);
  });

  it("mixing a correct and a wrong pick is not a clean subset → 0 (1 hit − 1 wrong)/2", () => {
    const r = gradeAnswers([bouquet], { b: ["Junmai", "Ginjo"] });
    expect(r.detail[0].ok).toBe(false);
    expect(r.detail[0].fraction).toBe(0);
  });

  it("a THREE-correct key keeps batch-10 partial credit (not either/or)", () => {
    const three = q({ id: "t", type: "multi", options: ["A", "B", "C", "D"], correct: [0, 1, 2] });
    const r = gradeAnswers([three], { t: ["A"] });
    expect(r.detail[0].ok).toBe(false); // one of three is NOT full credit
    expect(r.detail[0].fraction).toBeCloseTo(1 / 3);
  });
});
