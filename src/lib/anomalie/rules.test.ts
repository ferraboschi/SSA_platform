import { describe, it, expect } from "vitest";
import {
  duplicatePeople,
  isAutoMergeableCluster,
  resolvedReviewNoteIds,
  repaidClusters,
  duplicateCourses,
  missingCompanions,
  fullDiscountCancelled,
  cashOnCancelled,
  openCredits,
  type CorsistaLite,
  type ReviewNoteRow,
  type EnrRow,
  type CorsoLite,
  type PurchaseCorsoRow,
  type PartecipanteRow,
  type CreditoRow,
} from "./rules";

// ── Tiny fixture helpers ────────────────────────────────────────────────────

function person(p: Partial<CorsistaLite> & { id: number }): CorsistaLite {
  return {
    full_name: null,
    email: null,
    phone: null,
    merged_into: null,
    ...p,
  };
}

function course(c: Partial<CorsoLite> & { id: number }): CorsoLite {
  return {
    short_title: null,
    full_title: null,
    type: "wset1",
    delivery_mode: null,
    month: null,
    year: null,
    city: null,
    lifecycle: null,
    ...c,
  };
}

function enrollment(e: Partial<EnrRow> & { id: number; corso_id: number }): EnrRow {
  return {
    corsista_id: 1,
    amount_cents: 12000,
    discount_cents: 0,
    ...e,
  };
}

// ── Bonifica — resolvedReviewNoteIds (stale notes of merged dups) ────────────

describe("resolvedReviewNoteIds", () => {
  const row = (p: Partial<ReviewNoteRow> & { id: number }): ReviewNoteRow => ({
    email: null,
    merged_into: null,
    review_note: null,
    ...p,
  });

  it("flags a survivor whose referenced duplicate was merged INTO it", () => {
    const rows = [
      row({ id: 2121, email: "nini87@gmail.com", review_note: "Possibile duplicato di Nini (purple87@hotmail.it) — stesso telefono" }),
      row({ id: 2512, email: "purple87@hotmail.it", merged_into: 2121 }),
    ];
    expect(resolvedReviewNoteIds(rows)).toEqual([2121]);
  });

  it("flags a record that is itself merged (its note is moot)", () => {
    const rows = [row({ id: 5, email: "a@x.it", merged_into: 9, review_note: "Possibile duplicato di X (b@x.it) — stesso telefono" })];
    expect(resolvedReviewNoteIds(rows)).toEqual([5]);
  });

  it("does NOT flag a note whose referenced duplicate is still OPEN (not merged)", () => {
    const rows = [
      row({ id: 1, email: "a@x.it", review_note: "Possibile duplicato di Y (b@x.it) — stesso telefono" }),
      row({ id: 2, email: "b@x.it", merged_into: null }),
    ];
    expect(resolvedReviewNoteIds(rows)).toEqual([]);
  });

  it("ignores rows without a note", () => {
    expect(resolvedReviewNoteIds([row({ id: 1, email: "a@x.it" })])).toEqual([]);
  });
});

// ── Rule A — duplicatePeople (union-find) ───────────────────────────────────

describe("duplicatePeople (union-find)", () => {
  it("merges people who share an email into one cluster", () => {
    const all = [
      person({ id: 1, full_name: "Mario Rossi", email: "m@x.it" }),
      person({ id: 2, full_name: "M. Rossi", email: "M@X.it" }), // same email (case-insensitive)
    ];
    const clusters = duplicatePeople(all, new Map(), new Set());
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons).toContain("email");
    expect(clusters[0].confidence).toBe("alta");
    expect(clusters[0].members.map((m) => m.id).sort()).toEqual([1, 2]);
    expect(clusters[0].nameKey).toBe("dup-1-2");
  });

  it("merges people who share a phone (normalized) into one cluster", () => {
    const all = [
      person({ id: 1, full_name: "A", phone: "+39 333 12 34 56" }),
      person({ id: 2, full_name: "B", phone: "0039-333-123456" }), // 00 → + , punctuation stripped
    ];
    const clusters = duplicatePeople(all, new Map(), new Set());
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons).toContain("phone");
    expect(clusters[0].confidence).toBe("alta");
  });

  it("merges same multi-word name as a 'media' (homonymy) cluster", () => {
    const all = [
      person({ id: 1, full_name: "Giulia Bianchi", email: "a@a.it" }),
      person({ id: 2, full_name: "giulia  bianchi", email: "b@b.it" }),
    ];
    const clusters = duplicatePeople(all, new Map(), new Set());
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons).toEqual(["name"]);
    expect(clusters[0].confidence).toBe("media");
  });

  it("keeps distinct people apart (no shared email/phone/name → no cluster)", () => {
    const all = [
      person({ id: 1, full_name: "Mario Rossi", email: "m@x.it", phone: "+391111111" }),
      person({ id: 2, full_name: "Anna Verdi", email: "a@y.it", phone: "+392222222" }),
    ];
    expect(duplicatePeople(all, new Map(), new Set())).toHaveLength(0);
  });

  it("does NOT link on a single-word name (needs ≥2 words)", () => {
    const all = [
      person({ id: 1, full_name: "Mario", email: "a@a.it" }),
      person({ id: 2, full_name: "mario", email: "b@b.it" }),
    ];
    expect(duplicatePeople(all, new Map(), new Set())).toHaveLength(0);
  });

  it("excludes already-merged records and honours the reviewed set", () => {
    const all = [
      person({ id: 1, full_name: "Mario Rossi", email: "m@x.it" }),
      person({ id: 2, full_name: "Mario Rossi", email: "m@x.it" }),
      person({ id: 3, full_name: "Mario Rossi", email: "m@x.it", merged_into: 1 }), // hidden
    ];
    // merged_into=3 is dropped, so the cluster is {1,2} → key dup-1-2.
    const clusters = duplicatePeople(all, new Map(), new Set());
    expect(clusters[0].members.map((m) => m.id)).toEqual([1, 2]);
    // Now mark that cluster reviewed → it disappears.
    expect(duplicatePeople(all, new Map(), new Set(["dup-1-2"]))).toHaveLength(0);
  });

  it("picks the survivor with the most enrollments (ties → lowest id)", () => {
    const all = [
      person({ id: 5, full_name: "Mario Rossi", email: "m@x.it" }),
      person({ id: 9, full_name: "Mario Rossi", email: "m@x.it" }),
    ];
    const enrCount = new Map([
      [5, 1],
      [9, 4],
    ]);
    const clusters = duplicatePeople(all, enrCount, new Set());
    expect(clusters[0].survivorId).toBe(9);
    // members sorted by enrollments desc → 9 first.
    expect(clusters[0].members.map((m) => m.id)).toEqual([9, 5]);
  });
});

// ── Phase-rule 1 — missingCompanions (doppio-no-2nd) ────────────────────────

describe("missingCompanions", () => {
  const corso = new Map<number, CorsoLite>([
    [10, course({ id: 10, full_title: "WSET Level 1 — Milano", short_title: "WSET1" })],
  ]);
  const names = new Map<number, string>([[1, "Mario Rossi"]]);

  it("flags a 2-ticket buyer with fewer than 1 companion", () => {
    const enr = [enrollment({ id: 100, corso_id: 10, corsista_id: 1 })];
    const purchases: PurchaseCorsoRow[] = [
      { corsista_id: 1, product_title: "WSET Level 1 — Milano" },
      { corsista_id: 1, product_title: "WSET Level 1 — Milano" }, // 2 tickets
    ];
    const partecipanti: PartecipanteRow[] = []; // 0 companions named
    const out = missingCompanions(enr, corso, names, purchases, partecipanti);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      corsistaName: "Mario Rossi",
      courseTitle: "WSET Level 1 — Milano",
      ticketsBought: 2,
      missing: 1,
    });
  });

  it("does NOT flag when the companion is already filled", () => {
    const enr = [enrollment({ id: 100, corso_id: 10, corsista_id: 1 })];
    const purchases: PurchaseCorsoRow[] = [
      { corsista_id: 1, product_title: "WSET Level 1 — Milano" },
      { corsista_id: 1, product_title: "WSET Level 1 — Milano" },
    ];
    const partecipanti: PartecipanteRow[] = [{ iscrizione_id: 100 }]; // 1 companion → complete
    expect(missingCompanions(enr, corso, names, purchases, partecipanti)).toHaveLength(0);
  });

  it("does NOT flag a single-ticket buyer", () => {
    const enr = [enrollment({ id: 100, corso_id: 10, corsista_id: 1 })];
    const purchases: PurchaseCorsoRow[] = [
      { corsista_id: 1, product_title: "WSET Level 1 — Milano" }, // only 1 ticket
    ];
    expect(missingCompanions(enr, corso, names, purchases, [])).toHaveLength(0);
  });
});

// ── Phase-rule 2 — fullDiscountCancelled (cancelled-100off) ─────────────────

describe("fullDiscountCancelled", () => {
  const names = new Map<number, string>([[1, "Mario Rossi"]]);

  it("flags a net-0 seat on a CANCELLED course", () => {
    const corso = new Map<number, CorsoLite>([
      [10, course({ id: 10, full_title: "Corso X", lifecycle: "cancelled" })],
    ]);
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, discount_cents: 12000 }),
    ];
    const out = fullDiscountCancelled(enr, corso, names);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ corsistaName: "Mario Rossi", courseTitle: "Corso X", amount: 120 });
  });

  it("flags a net-0 seat on a MISSING course as '(corso mancante)'", () => {
    const corso = new Map<number, CorsoLite>(); // corso_id 10 absent
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 8000, discount_cents: 9000 }),
    ];
    const out = fullDiscountCancelled(enr, corso, names);
    expect(out).toHaveLength(1);
    expect(out[0].courseTitle).toBe("(corso mancante)");
  });

  it("does NOT flag a net-0 seat on a valid upcoming course", () => {
    const corso = new Map<number, CorsoLite>([
      [10, course({ id: 10, full_title: "Corso X", lifecycle: "upcoming" })],
    ]);
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, discount_cents: 12000 }),
    ];
    expect(fullDiscountCancelled(enr, corso, names)).toHaveLength(0);
  });

  it("does NOT flag a partially-paid seat (net > 0) even on a cancelled course", () => {
    const corso = new Map<number, CorsoLite>([
      [10, course({ id: 10, full_title: "Corso X", lifecycle: "cancelled" })],
    ]);
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, discount_cents: 2000 }),
    ];
    expect(fullDiscountCancelled(enr, corso, names)).toHaveLength(0);
  });
});

// ── Phase-rule 3 — cashOnCancelled ──────────────────────────────────────────

describe("cashOnCancelled", () => {
  const corso = new Map<number, CorsoLite>([
    [10, course({ id: 10, full_title: "Corso X", lifecycle: "cancelled" })],
    [11, course({ id: 11, full_title: "Corso Y", lifecycle: "upcoming" })],
  ]);
  const names = new Map<number, string>([[1, "Mario Rossi"]]);

  it("flags a paid seat on a cancelled course with no credit yet", () => {
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, financial_status: "paid" }),
    ];
    const out = cashOnCancelled(enr, corso, names, new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ courseTitle: "Corso X", corsistaName: "Mario Rossi", amount: 120 });
  });

  it("treats a null financial_status as paid (legacy rows)", () => {
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, financial_status: null }),
    ];
    expect(cashOnCancelled(enr, corso, names, new Set())).toHaveLength(1);
  });

  it("does NOT flag when a credit already exists for that enrollment", () => {
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, financial_status: "paid" }),
    ];
    expect(cashOnCancelled(enr, corso, names, new Set([100]))).toHaveLength(0);
  });

  it("does NOT flag a non-paid (pending) seat", () => {
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, financial_status: "pending" }),
    ];
    expect(cashOnCancelled(enr, corso, names, new Set())).toHaveLength(0);
  });

  it("does NOT flag a seat on a non-cancelled course", () => {
    const enr = [
      enrollment({ id: 101, corso_id: 11, corsista_id: 1, amount_cents: 12000, financial_status: "paid" }),
    ];
    expect(cashOnCancelled(enr, corso, names, new Set())).toHaveLength(0);
  });

  it("does NOT flag a net-0 seat (no money collected)", () => {
    const enr = [
      enrollment({ id: 100, corso_id: 10, corsista_id: 1, amount_cents: 12000, discount_cents: 12000, financial_status: "paid" }),
    ];
    expect(cashOnCancelled(enr, corso, names, new Set())).toHaveLength(0);
  });
});

// ── Phase-rule 4 — openCredits ──────────────────────────────────────────────

describe("openCredits", () => {
  const corso = new Map<number, CorsoLite>([
    [10, course({ id: 10, full_title: "Corso Origine" })],
  ]);
  const names = new Map<number, string>([[1, "Mario Rossi"]]);

  it("returns one row per open credit, resolving names + origin title", () => {
    const credits: CreditoRow[] = [
      { corsista_id: 1, importo_cents: 12000, corso_origine_id: 10, stato: "aperto" },
      { corsista_id: 2, importo_cents: 5000, corso_origine_id: null, stato: "aperto" },
    ];
    const out = openCredits(credits, corso, names);
    expect(out).toHaveLength(2);
    // Sorted by amount desc.
    expect(out[0]).toMatchObject({ corsistaName: "Mario Rossi", amount: 120, originCourseTitle: "Corso Origine" });
    expect(out[1]).toMatchObject({ corsistaName: "#2", amount: 50, originCourseTitle: "—" });
  });

  it("returns an empty array when there are no open credits", () => {
    expect(openCredits([], corso, names)).toHaveLength(0);
  });
});

describe("repaidClusters (paid twice in the same course type)", () => {
  const corsi = new Map<number, CorsoLite>([
    [10, course({ id: 10, short_title: "Cert A", type: "certificato" })],
    [11, course({ id: 11, short_title: "Cert B", type: "certificato" })],
  ]);
  const names = new Map<number, string>([[1, "Mario Rossi"]]);
  const paid = (id: number, cid: number, corso: number): EnrRow => ({
    id,
    corsista_id: cid,
    corso_id: corso,
    amount_cents: 30000,
    discount_cents: 0,
  });

  it("flags a person with 2+ PAID enrollments of the same type", () => {
    const out = repaidClusters([paid(1, 1, 10), paid(2, 1, 11), paid(3, 2, 10)], corsi, names);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ corsistaId: 1, name: "Mario Rossi", type: "certificato" });
    expect(out[0].courses).toHaveLength(2);
  });

  it("does not count a fully-discounted (net 0) seat as a paid repeat", () => {
    const free: EnrRow = { id: 2, corsista_id: 1, corso_id: 11, amount_cents: 30000, discount_cents: 30000 };
    expect(repaidClusters([paid(1, 1, 10), free], corsi, names)).toHaveLength(0);
  });

  it("does not flag a single paid enrollment", () => {
    expect(repaidClusters([paid(1, 1, 10)], corsi, names)).toHaveLength(0);
  });
});

describe("duplicateCourses (same slot listed twice)", () => {
  it("flags 2+ in-person courses sharing type|city|month|year, keeps enrolled counts", () => {
    const corsi = new Map<number, CorsoLite>([
      [10, course({ id: 10, short_title: "Roma A", type: "certificato", delivery_mode: "presenza", city: "Roma", month: "Marzo", year: 2026 })],
      [11, course({ id: 11, short_title: "Roma B", type: "certificato", delivery_mode: "presenza", city: "Roma", month: "Marzo", year: 2026 })],
      [12, course({ id: 12, short_title: "Milano", type: "certificato", delivery_mode: "presenza", city: "Milano", month: "Marzo", year: 2026 })],
    ]);
    const out = duplicateCourses(corsi, new Map([[10, 8], [11, 3], [12, 5]]));
    expect(out).toHaveLength(1);
    expect(out[0].courses.map((c) => c.id).sort()).toEqual(["10", "11"]);
    expect(out[0].courses.find((c) => c.id === "10")?.enrolled).toBe(8);
  });

  it("groups online courses by type|month|year, ignoring city", () => {
    const corsi = new Map<number, CorsoLite>([
      [20, course({ id: 20, type: "introduttivo", delivery_mode: "online", city: "Roma", month: "Luglio", year: 2026 })],
      [21, course({ id: 21, type: "introduttivo", delivery_mode: "online", city: "Milano", month: "Luglio", year: 2026 })],
    ]);
    expect(duplicateCourses(corsi, new Map())).toHaveLength(1);
  });

  it("ignores courses with no month/year and single-course slots", () => {
    const corsi = new Map<number, CorsoLite>([
      [30, course({ id: 30, type: "certificato", city: "Roma", month: "Marzo", year: 2026 })],
      [31, course({ id: 31, type: "certificato", city: "Roma", month: null, year: null })],
    ]);
    expect(duplicateCourses(corsi, new Map())).toHaveLength(0);
  });
});

// ── isAutoMergeableCluster — the safety gate for AUTOMATIC merging ───────────
// A shared phone/email alone is not proof of one person (family phones,
// company emails exist in prod); auto-merge additionally requires every
// member to carry the same normalized name, word order ignored.
describe("isAutoMergeableCluster", () => {
  it("same name in different order/case/accents → mergeable", () => {
    expect(isAutoMergeableCluster(["VENDRAMIN LAURA", "Laura Vendramin"])).toBe(true);
    expect(isAutoMergeableCluster(["Piotto  Matteo", "Matteo Piotto"])).toBe(true);
    expect(isAutoMergeableCluster(["josé pérez", "Jose Perez"])).toBe(true);
  });
  it("different people sharing a contact → NOT mergeable", () => {
    expect(isAutoMergeableCluster(["Elisa Hu", "Antonio Hu"])).toBe(false);
    expect(isAutoMergeableCluster(["Jacopo Tiezzi", "Nicola Savoldi"])).toBe(false);
    expect(isAutoMergeableCluster(["Aleandro Mattia Zucaro", "Aleandro Zucaro"])).toBe(false);
  });
  it("empty/blank names never auto-merge", () => {
    expect(isAutoMergeableCluster(["", ""])).toBe(false);
    expect(isAutoMergeableCluster(["  ", "Mario Rossi"])).toBe(false);
  });
});
