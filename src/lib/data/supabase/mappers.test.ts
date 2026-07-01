import { describe, it, expect } from "vitest";
import {
  computeStatus,
  deriveLifecycle,
  iscrizioneToEnrollment,
  corsoRowToDomain,
  examTemplateRowToDomain,
  examTemplateToData,
  placeholderEducator,
  profileToUser,
} from "./mappers";
import type { CorsoRow, IscrizioneRow, ExamTemplateRow, ProfileRow } from "./rows";

// ── computeStatus — course health from fill ratio ───────────────────────────
describe("computeStatus", () => {
  it("past/archived: meets the minimum → in-traiettoria, else critico", () => {
    expect(computeStatus(10, 8, "passato")).toBe("in-traiettoria");
    expect(computeStatus(5, 8, "passato")).toBe("critico");
    expect(computeStatus(8, 8, "archiviato")).toBe("in-traiettoria");
  });
  it("active: ratio tiers 1 / .66 / .33", () => {
    expect(computeStatus(10, 10, "pubblicato")).toBe("in-traiettoria");
    expect(computeStatus(7, 10, "pubblicato")).toBe("monitor"); // .70
    expect(computeStatus(4, 10, "pubblicato")).toBe("rischio"); // .40
    expect(computeStatus(2, 10, "pubblicato")).toBe("critico"); // .20
  });
  it("a zero minimum never divides by zero (treated as full)", () => {
    expect(computeStatus(0, 0, "pubblicato")).toBe("in-traiettoria");
  });
});

// ── deriveLifecycle — a "pubblicato" course past its last day reads "passato" ──
// Regression test for the "Vercelli course never turns off" bug: the Shopify sync
// sets lifecycle="pubblicato" once and deliberately never revisits it, so nothing
// ever flipped a concluded course to "passato" — it stayed "active" everywhere
// forever. This derives the real transition from the calendar date at read time.
describe("deriveLifecycle", () => {
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

  it("a published course whose last day has passed reads as 'passato'", () => {
    expect(deriveLifecycle("pubblicato", iso(-10), 1)).toBe("passato");
    // 3-day course starting 3 days ago → day 1/2/3 = 3/2/1 days ago → last day
    // was yesterday → over.
    expect(deriveLifecycle("pubblicato", iso(-3), 3)).toBe("passato");
  });
  it("a published course still upcoming or ongoing stays 'pubblicato'", () => {
    expect(deriveLifecycle("pubblicato", iso(5), 1)).toBe("pubblicato");
    expect(deriveLifecycle("pubblicato", iso(0), 1)).toBe("pubblicato"); // starts today
    // 3-day course that started yesterday is still on day 2 → not over yet.
    expect(deriveLifecycle("pubblicato", iso(-1), 3)).toBe("pubblicato");
  });
  it("preserves terminal bozza/passato/cancelled values (never resurrected)", () => {
    expect(deriveLifecycle("bozza", iso(-100), 1)).toBe("bozza");
    expect(deriveLifecycle("passato", iso(5), 1)).toBe("passato");
    expect(deriveLifecycle("cancelled", iso(5), 1)).toBe("cancelled");
    expect(deriveLifecycle("cancelled", iso(-100), 1)).toBe("cancelled"); // annulled stays annulled
  });
  it("folds legacy 'archiviato' into the two-reason model by date", () => {
    expect(deriveLifecycle("archiviato", iso(-100), 1)).toBe("passato"); // it was held
    expect(deriveLifecycle("archiviato", iso(5), 1)).toBe("cancelled"); // pulled before its date
  });
  it("is defensive against a missing/malformed start_date", () => {
    expect(deriveLifecycle("pubblicato", null, 1)).toBe("pubblicato");
    expect(deriveLifecycle("pubblicato", "not-a-date", 1)).toBe("pubblicato");
  });
});

// ── iscrizioneToEnrollment — NET amount + corso normalization ────────────────
const corsoEmbedded = {
  id: 7,
  short_title: "Cert. Roma",
  full_title: "Corso Certificato Roma",
  type: "certificato" as const,
  city: "Roma",
  month: "Novembre",
  year: 2026,
  lifecycle: "pubblicato" as const,
};
const iscr = (over: Partial<IscrizioneRow>): IscrizioneRow => ({
  id: 1,
  corso_id: 7,
  corsista_id: 100,
  amount_cents: 30000,
  exam_result: null,
  historical: false,
  corso: corsoEmbedded,
  ...over,
});

describe("iscrizioneToEnrollment", () => {
  it("computes the NET amount paid (gross − discount), in euros", () => {
    const e = iscrizioneToEnrollment(iscr({ amount_cents: 30000, discount_cents: 5000 }))!;
    expect(e.amount).toBe(250); // (30000−5000)/100
  });
  it("a fully-discounted free re-participation shows 0, never a gross amount", () => {
    const e = iscrizioneToEnrollment(iscr({ amount_cents: 25000, discount_cents: 25000 }))!;
    expect(e.amount).toBe(0);
  });
  it("never goes negative if discount exceeds gross", () => {
    const e = iscrizioneToEnrollment(iscr({ amount_cents: 10000, discount_cents: 99999 }))!;
    expect(e.amount).toBe(0);
  });
  it("normalizes the embedded corso whether PostgREST returns an object or an array", () => {
    expect(iscrizioneToEnrollment(iscr({ corso: corsoEmbedded }))!.courseId).toBe("7");
    expect(iscrizioneToEnrollment(iscr({ corso: [corsoEmbedded] }))!.courseId).toBe("7");
  });
  it("returns null when the corso relation is missing", () => {
    expect(iscrizioneToEnrollment(iscr({ corso: null }))).toBeNull();
  });
  it("passes through the confirmed exam outcome + score", () => {
    const e = iscrizioneToEnrollment(iscr({ exam_result: "passed", exam_score_pct: 88 }))!;
    expect(e.examResult).toBe("passed");
    expect(e.examScorePct).toBe(88);
  });
});

// ── corsoRowToDomain — central course mapping ────────────────────────────────
const corso = (over: Partial<CorsoRow>): CorsoRow => ({
  id: 42,
  external_id: "ext-42",
  handle: "cert-roma-nov-2026",
  product_handle: null,
  short_title: "Cert. Roma",
  full_title: "Corso Certificato Roma",
  type: "certificato",
  type_label: "Sake Sommelier Certificato",
  delivery_mode: "presenza",
  city: "Roma",
  venue: null,
  month: "Novembre",
  year: 2026,
  start_date: "2026-11-14",
  price_cents: 90000,
  capacity: 20,
  min_students: 10,
  lifecycle: "pubblicato",
  status: null,
  educator_id: null,
  notebook: {},
  costs: {},
  ...over,
});

describe("corsoRowToDomain", () => {
  const edu = placeholderEducator();
  it("maps ids, price (cents→€) and the start day from start_date", () => {
    const c = corsoRowToDomain(corso({}), edu, 12, 0, [], []);
    expect(c.id).toBe("42");
    expect(c.price).toBe(900);
    expect(c.day).toBe(14);
    expect(c.days).toBe(3); // certificato
  });
  it("falls back the start day to 1 when start_date is missing/invalid", () => {
    expect(corsoRowToDomain(corso({ start_date: null }), edu, 0, 0, [], []).day).toBe(1);
    expect(corsoRowToDomain(corso({ start_date: "not-a-date" }), edu, 0, 0, [], []).day).toBe(1);
  });
  it("a stored 'pubblicato' course whose date has already passed reads as 'passato' (Vercelli bug)", () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    // fixture default: min_students 10, here enrolled=8 (below minimum).
    const c = corsoRowToDomain(corso({ lifecycle: "pubblicato", start_date: past }), edu, 8, 0, [], []);
    expect(c.lifecycle).toBe("passato");
    // The business status also switches to the concluded/final-tally rule instead
    // of the still-filling-up ratio (8/10=.80 would read as "monitor" forever) —
    // a concluded under-quota course must surface as "critico", not "monitor".
    expect(c.status).toBe("critico");
  });
  it("guards an off-enum type by falling back to 'certificato'", () => {
    const c = corsoRowToDomain(corso({ type: "wibble" as CorsoRow["type"] }), edu, 0, 0, [], []);
    expect(c.type).toBe("certificato");
  });
  it("uses a stored valid status, else computes it from the fill", () => {
    expect(corsoRowToDomain(corso({ status: "rischio" }), edu, 20, 0, [], []).status).toBe("rischio");
    // invalid stored status → computed (20/10 = full → in-traiettoria)
    expect(corsoRowToDomain(corso({ status: "bogus" }), edu, 20, 0, [], []).status).toBe("in-traiettoria");
  });
  it("merges stored cost overrides over the defaults and derives margin", () => {
    const c = corsoRowToDomain(corso({ costs: { adv: 100 } }), edu, 10, 5000, [], []);
    expect(c.costs.adv).toBe(100);
    expect(c.margin).toBe(Math.round(c.revenue - c.totalCost));
  });
  it("reads the cancelled flag + reason from the notebook json", () => {
    const c = corsoRowToDomain(corso({ notebook: { cancelled: true, cancelReason: "pochi iscritti" } }), edu, 0, 0, [], []);
    expect(c.cancelled).toBe(true);
    expect(c.cancelReason).toBe("pochi iscritti");
  });
  it("never fabricates revenue: a genuine net-0 (all free/transferred/unpaid) stays 0", () => {
    // 12 enrolled but 0 collected. The old `revenue || enrolled*price*0.85` invented
    // ~9180€ of phantom income; real revenue is 0 and must read 0.
    const c = corsoRowToDomain(corso({}), edu, 12, 0, [], []);
    expect(c.revenue).toBe(0);
    expect(c.margin).toBe(-c.totalCost);
  });
  it("a cancelled course is out of the P&L: revenue and margin forced to 0", () => {
    // lifecycle='cancelled' with money on paper — must not count as delivered revenue.
    const c = corsoRowToDomain(corso({ lifecycle: "cancelled" }), edu, 10, 30000, [], []);
    expect(c.cancelled).toBe(true);
    expect(c.revenue).toBe(0);
    expect(c.margin).toBe(0);
  });
  it("unifies 'cancelled': a lifecycle-cancelled course reads cancelled even without the notebook flag", () => {
    const c = corsoRowToDomain(corso({ lifecycle: "cancelled" }), edu, 5, 0, [], []);
    expect(c.cancelled).toBe(true);
  });
  it("recognises transfer credits only on a DELIVERED destination course", () => {
    const past = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    // Delivered (passato): the 300€ applied credit IS recognised as revenue.
    const delivered = corsoRowToDomain(corso({ start_date: past }), edu, 8, 0, [], [], 300);
    expect(delivered.lifecycle).toBe("passato");
    expect(delivered.revenue).toBe(300);
    // Upcoming (pubblicato): the same credit is DEFERRED — not yet revenue.
    const upcoming = corsoRowToDomain(corso({ start_date: future }), edu, 8, 0, [], [], 300);
    expect(upcoming.lifecycle).toBe("pubblicato");
    expect(upcoming.revenue).toBe(0);
  });
  it("never recognises a credit on a cancelled course (origin stays 0)", () => {
    const c = corsoRowToDomain(corso({ lifecycle: "cancelled" }), edu, 8, 0, [], [], 300);
    expect(c.revenue).toBe(0);
  });
});

// ── examTemplateRowToDomain — bank normalization (legacy + rich) + dedup ──────
describe("examTemplateRowToDomain", () => {
  it("maps DB family certificato→nihonshu, shochu→shochu", () => {
    expect(examTemplateRowToDomain({ id: 1, family: "certificato", name: "X", data: {} }).family).toBe("nihonshu");
    expect(examTemplateRowToDomain({ id: 1, family: "shochu", name: "X", data: {} }).family).toBe("shochu");
  });

  it("normalizes a LEGACY {prompt, choices} question to options + correct indices", () => {
    const row: ExamTemplateRow = {
      id: 5,
      family: "certificato",
      name: "Esame",
      data: {
        questions: [
          { prompt: "Cos'è il junmai?", choices: [{ text: "A", correct: false }, { text: "B", correct: true }] },
        ],
      },
    };
    const q = examTemplateRowToDomain(row).finalExam.questions[0];
    expect(q.type).toBe("single");
    expect(q.options).toEqual(["A", "B"]);
    expect(q.correct).toEqual([1]);
    expect(q.text).toBe("Cos'è il junmai?");
  });

  it("infers 'multi' when a legacy question has more than one correct choice", () => {
    const row: ExamTemplateRow = {
      id: 6,
      family: "certificato",
      name: "E",
      data: { questions: [{ prompt: "?", choices: [{ text: "A", correct: true }, { text: "B", correct: true }, { text: "C", correct: false }] }] },
    };
    expect(examTemplateRowToDomain(row).finalExam.questions[0].type).toBe("multi");
  });

  it("passes through the RICH editor shape (keeps type/correct)", () => {
    const row: ExamTemplateRow = {
      id: 7,
      family: "certificato",
      name: "E",
      data: { questions: [{ id: "q1", type: "truefalse", text: "Vero?", options: ["Vero", "Falso"], correct: [0] }] },
    };
    const q = examTemplateRowToDomain(row).finalExam.questions[0];
    expect(q.id).toBe("q1");
    expect(q.type).toBe("truefalse");
    expect(q.correct).toEqual([0]);
  });

  it("drops duplicate questions by normalized text (re-imported bank)", () => {
    const dup = { prompt: "Stessa  Domanda", choices: [{ text: "A", correct: true }] };
    const dup2 = { prompt: "stessa domanda", choices: [{ text: "A", correct: true }] };
    const row: ExamTemplateRow = { id: 8, family: "certificato", name: "E", data: { questions: [dup, dup2] } };
    expect(examTemplateRowToDomain(row).finalExam.questions).toHaveLength(1);
  });

  it("supplies default per-day mini-tests when none are stored (nihonshu=3, shochu=2)", () => {
    expect(examTemplateRowToDomain({ id: 9, family: "certificato", name: "E", data: {} }).miniTests).toHaveLength(3);
    expect(examTemplateRowToDomain({ id: 9, family: "shochu", name: "E", data: {} }).miniTests).toHaveLength(2);
  });

  it("round-trips through examTemplateToData (rich serialization preserves questions)", () => {
    const row: ExamTemplateRow = {
      id: 10,
      family: "certificato",
      name: "E",
      data: { questions: [{ id: "q1", type: "single", text: "Q", options: ["A", "B"], correct: [1] }] },
    };
    const domain = examTemplateRowToDomain(row);
    const data = examTemplateToData(domain);
    expect(data.rich).toBe(true);
    expect(data.questions?.[0]).toMatchObject({ id: "q1", type: "single", correct: [1] });
  });
});

// ── profileToUser — name + initials derivation ───────────────────────────────
describe("profileToUser", () => {
  const prof = (over: Partial<ProfileRow>): ProfileRow => ({
    id: "u1",
    email: "lorenzo@ef-ti.com",
    first_name: "Lorenzo",
    last_name: "Ferrari",
    display_name: null,
    role: "admin",
    phone: "",
    city: "",
    position: "",
    photo_url: null,
    locale: "IT",
    ...over,
  });
  it("derives name + initials from first/last", () => {
    const u = profileToUser(prof({}));
    expect(u.name).toBe("Lorenzo Ferrari");
    expect(u.initials).toBe("LF");
  });
  it("prefers an explicit display_name", () => {
    expect(profileToUser(prof({ display_name: "Lori F." })).name).toBe("Lori F.");
  });
  it("falls back to the email when no names are present", () => {
    const u = profileToUser(prof({ first_name: "", last_name: "", display_name: null }));
    expect(u.name).toBe("lorenzo@ef-ti.com");
    expect(u.initials).toBe("?");
  });
});
