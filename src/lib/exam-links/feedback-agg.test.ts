import { describe, it, expect } from "vitest";
import { aggregateFeedback, type FeedbackQuestion } from "./feedback-agg";

const ratingQ: FeedbackQuestion = { id: "r", type: "rating", text: "Voto?", options: [] };
const choiceQ: FeedbackQuestion = { id: "c", type: "single", text: "Preferito?", options: ["Junmai", "Ginjo", "Honjozo"] };
const openQ: FeedbackQuestion = { id: "o", type: "open", text: "Commenti?", options: [] };
const rows = (...answers: Array<Record<string, string | string[]>>) => answers.map((a) => ({ answers: a }));

describe("aggregateFeedback — rating", () => {
  it("averages valid 1–5 ratings and bins them into 1..5 buckets", () => {
    const r = aggregateFeedback([ratingQ], rows({ r: "5" }, { r: "4" }, { r: "3" })).questions[0];
    expect(r.kind).toBe("rating");
    expect(r.answered).toBe(3);
    expect(r.ratingAvg).toBe(4); // (5+4+3)/3
    expect(r.ratingBuckets).toEqual([0, 0, 1, 1, 1]); // one each at 3,4,5
  });
  it("rounds the average to one decimal", () => {
    const q = aggregateFeedback([ratingQ], rows({ r: "5" }, { r: "4" })).questions[0];
    expect(q.ratingAvg).toBe(4.5);
  });
  it("ignores out-of-range / non-numeric ratings (answered matches the average denominator)", () => {
    const q = aggregateFeedback([ratingQ], rows({ r: "0" }, { r: "6" }, { r: "abc" }, { r: "4" })).questions[0];
    expect(q.answered).toBe(1);
    expect(q.ratingAvg).toBe(4);
  });
  it("returns null average with no valid ratings", () => {
    const q = aggregateFeedback([ratingQ], rows({ r: "" })).questions[0];
    expect(q.ratingAvg).toBeNull();
    expect(q.answered).toBe(0);
  });
});

describe("aggregateFeedback — choice", () => {
  it("counts option selections by TEXT, case-insensitively", () => {
    const q = aggregateFeedback([choiceQ], rows({ c: "Junmai" }, { c: "junmai" }, { c: "Ginjo" })).questions[0];
    expect(q.kind).toBe("choice");
    expect(q.optionLabels).toEqual(["Junmai", "Ginjo", "Honjozo"]);
    expect(q.optionCounts).toEqual([2, 1, 0]);
    expect(q.answered).toBe(3);
  });
  it("handles multi-select answers", () => {
    const q = aggregateFeedback([choiceQ], rows({ c: ["Junmai", "Honjozo"] })).questions[0];
    expect(q.optionCounts).toEqual([1, 0, 1]);
    expect(q.answered).toBe(1);
  });
});

describe("aggregateFeedback — open", () => {
  it("collects non-empty open responses", () => {
    const q = aggregateFeedback([openQ], rows({ o: "Ottimo corso" }, { o: "" }, { o: "Bravo educator" })).questions[0];
    expect(q.kind).toBe("open");
    expect(q.openResponses).toEqual(["Ottimo corso", "Bravo educator"]);
    expect(q.answered).toBe(2);
  });
});

describe("aggregateFeedback — overall", () => {
  it("reports the total response count and skips unanswered questions per row", () => {
    const res = aggregateFeedback(
      [ratingQ, choiceQ, openQ],
      rows({ r: "5", c: "Junmai" }, { r: "3" }, { o: "ciao" }),
    );
    expect(res.responses).toBe(3);
    expect(res.questions).toHaveLength(3);
    expect(res.questions[0].answered).toBe(2); // two rated
    expect(res.questions[1].answered).toBe(1); // one chose
    expect(res.questions[2].answered).toBe(1); // one commented
  });
  it("handles no submissions", () => {
    const res = aggregateFeedback([ratingQ], []);
    expect(res.responses).toBe(0);
    expect(res.questions[0].answered).toBe(0);
    expect(res.questions[0].ratingAvg).toBeNull();
  });
});

describe("aggregateFeedback — per thematic area", () => {
  const storiaA: FeedbackQuestion = { id: "s1", type: "rating", text: "Storia?", options: [], cat: "Storia" };
  const storiaB: FeedbackQuestion = { id: "s2", type: "rating", text: "Storia 2?", options: [], cat: "Storia" };
  const servizio: FeedbackQuestion = { id: "v1", type: "rating", text: "Servizio?", options: [], cat: "Servizio" };

  it("rolls up rating answers per area (mean over ALL the area's ratings)", () => {
    const res = aggregateFeedback(
      [storiaA, storiaB, servizio],
      rows({ s1: "5", s2: "3", v1: "2" }, { s1: "4", s2: "4", v1: "2" }),
    );
    const byArea = Object.fromEntries(res.areas.map((a) => [a.name, a]));
    // Storia = mean(5,3,4,4) = 4.0 over 4 answers; Servizio = mean(2,2) = 2.0.
    expect(byArea.Storia.ratingAvg).toBe(4);
    expect(byArea.Storia.answered).toBe(4);
    expect(byArea.Servizio.ratingAvg).toBe(2);
    expect(byArea.Servizio.answered).toBe(2);
  });

  it("questions without an area fall under 'Generale'", () => {
    const res = aggregateFeedback([ratingQ], rows({ r: "5" }));
    expect(res.areas.map((a) => a.name)).toEqual(["Generale"]);
  });
});
