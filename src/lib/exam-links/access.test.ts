import { describe, it, expect } from "vitest";
import {
  asPositiveIntId,
  resolveSubjectIds,
  hasSubject,
  subjectKeyOf,
  subjectColId,
} from "./access";

describe("asPositiveIntId", () => {
  it("accepts a bare positive integer string", () => {
    expect(asPositiveIntId("42")).toBe(42);
    expect(asPositiveIntId("0")).toBe(0);
  });
  it("rejects null/undefined/empty/non-numeric/signed/float", () => {
    expect(asPositiveIntId(null)).toBeNull();
    expect(asPositiveIntId(undefined)).toBeNull();
    expect(asPositiveIntId("")).toBeNull();
    expect(asPositiveIntId("12a")).toBeNull();
    expect(asPositiveIntId("-3")).toBeNull();
    expect(asPositiveIntId("3.5")).toBeNull();
    expect(asPositiveIntId(" 3")).toBeNull();
  });
});

describe("resolveSubjectIds", () => {
  it("parses course + corsista (s) personal link", () => {
    expect(resolveSubjectIds({ c: "10", s: "7" })).toEqual({
      corsoId: 10,
      corsistaId: 7,
      partecipanteId: null,
    });
  });
  it("parses course + companion (p) personal link", () => {
    expect(resolveSubjectIds({ c: "10", p: "5" })).toEqual({
      corsoId: 10,
      corsistaId: null,
      partecipanteId: 5,
    });
  });
  it("non-numeric course → corsoId null (shared/tampered token)", () => {
    expect(resolveSubjectIds({ c: "planner" })).toEqual({
      corsoId: null,
      corsistaId: null,
      partecipanteId: null,
    });
  });
});

describe("hasSubject", () => {
  it("true iff a subject id is set", () => {
    expect(hasSubject({ corsistaId: 1, partecipanteId: null })).toBe(true);
    expect(hasSubject({ corsistaId: null, partecipanteId: 2 })).toBe(true);
    expect(hasSubject({ corsistaId: null, partecipanteId: null })).toBe(false);
  });
});

describe("subjectKeyOf (corsista-first)", () => {
  it("corsista → c<id>, companion → p<id>, none → null", () => {
    expect(subjectKeyOf({ corsistaId: 7, partecipanteId: null })).toBe("c7");
    expect(subjectKeyOf({ corsistaId: null, partecipanteId: 5 })).toBe("p5");
    expect(subjectKeyOf({ corsistaId: null, partecipanteId: null })).toBeNull();
  });
});

describe("subjectColId", () => {
  it("maps to the exam_progress/exam_submissions column + id", () => {
    expect(subjectColId({ corsistaId: 7, partecipanteId: null })).toEqual({
      col: "corsista_id",
      id: 7,
    });
    expect(subjectColId({ corsistaId: null, partecipanteId: 5 })).toEqual({
      col: "partecipante_id",
      id: 5,
    });
    expect(subjectColId({ corsistaId: null, partecipanteId: null })).toBeNull();
  });
});
