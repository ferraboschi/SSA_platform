import { describe, it, expect } from "vitest";
import {
  coerceSavedEmailTemplates,
  mergeExamEmailTemplates,
  DEFAULTS_BY_LANG,
} from "./exam-email";

describe("coerceSavedEmailTemplates (back-compat)", () => {
  it("returns {} for null/garbage", () => {
    expect(coerceSavedEmailTemplates(null)).toEqual({});
    expect(coerceSavedEmailTemplates(undefined)).toEqual({});
    expect(coerceSavedEmailTemplates("nope")).toEqual({});
    expect(coerceSavedEmailTemplates(42)).toEqual({});
    expect(coerceSavedEmailTemplates({})).toEqual({});
  });

  it("reads a LEGACY flat value (keyed by outcome) as the Italian slice", () => {
    const legacy = {
      passed: { subject: "S", body: "B" },
      retrial: { subject: "S2", body: "B2" },
      failed: { subject: "S3", body: "B3" },
    };
    expect(coerceSavedEmailTemplates(legacy)).toEqual({ it: legacy });
  });

  it("treats an outcome-only partial as the Italian slice too", () => {
    const partial = { passed: { subject: "only-subject" } };
    expect(coerceSavedEmailTemplates(partial)).toEqual({ it: partial });
  });

  it("passes a NESTED per-language value through, dropping unknown languages", () => {
    const nested = {
      it: { passed: { subject: "it-s", body: "it-b" } },
      en: { failed: { subject: "en-s", body: "en-b" } },
      xx: { passed: { subject: "ignored", body: "x" } },
    };
    const out = coerceSavedEmailTemplates(nested);
    expect(out.it).toEqual(nested.it);
    expect(out.en).toEqual(nested.en);
    expect(out.ja).toBeUndefined();
    expect((out as Record<string, unknown>).xx).toBeUndefined();
  });
});

describe("mergeExamEmailTemplates (per-language defaults)", () => {
  it("falls back to the language's built-in defaults when unedited", () => {
    expect(mergeExamEmailTemplates(null, "en")).toEqual(DEFAULTS_BY_LANG.en);
    expect(mergeExamEmailTemplates(undefined, "ja")).toEqual(DEFAULTS_BY_LANG.ja);
    // Default lang is Italian (byte-identical legacy behaviour).
    expect(mergeExamEmailTemplates(null)).toEqual(DEFAULTS_BY_LANG.it);
  });

  it("lets a saved field win over the default, filling the rest from defaults", () => {
    const merged = mergeExamEmailTemplates(
      { passed: { subject: "Custom EN subject" } },
      "en",
    );
    expect(merged.passed.subject).toBe("Custom EN subject");
    // Body untouched → English default body.
    expect(merged.passed.body).toBe(DEFAULTS_BY_LANG.en.passed.body);
    // Other outcomes fully defaulted.
    expect(merged.retrial).toEqual(DEFAULTS_BY_LANG.en.retrial);
    expect(merged.failed).toEqual(DEFAULTS_BY_LANG.en.failed);
  });

  it("preserves a legacy Italian edit end-to-end (coerce → merge)", () => {
    const legacy = {
      passed: { subject: "Owner-edited IT", body: "Owner IT body" },
    };
    const saved = coerceSavedEmailTemplates(legacy);
    const merged = mergeExamEmailTemplates(saved.it ?? null, "it");
    expect(merged.passed.subject).toBe("Owner-edited IT");
    expect(merged.passed.body).toBe("Owner IT body");
    expect(merged.retrial).toEqual(DEFAULTS_BY_LANG.it.retrial);
  });
});
