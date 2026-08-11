import { describe, it, expect } from "vitest";
import { parseCourseTitle, parseCourseFromMetafields, detectType } from "./course-title";

describe("parseCourseTitle", () => {
  // ── Real Shopify titles that USED to be silently skipped (year regex was
  //    2026+). 2024/2025 are pure-Shopify years → they must now parse. ──
  it("parses a 2024 introduttivo with day-first date", () => {
    expect(parseCourseTitle("Introduzione al Sake - 15 Aprile 2024 - Torino")).toMatchObject({
      type: "introduttivo",
      month: 4,
      year: 2024,
      delivery: "in-person",
    });
  });

  it("parses a 2025 shochu with city-first title", () => {
    expect(parseCourseTitle("Shochu Milano, Gennaio 2025")).toMatchObject({
      type: "shochu",
      month: 1,
      year: 2025,
    });
  });

  it('parses a 2024 certificato with "8 date Online"', () => {
    expect(parseCourseTitle("Sake Sommelier Certificato - 8 date Online - Gennaio 2024")).toMatchObject({
      type: "certificato",
      month: 1,
      year: 2024,
      delivery: "online",
    });
  });

  it("still parses a 2026 course", () => {
    expect(parseCourseTitle("Corso di Sake Sommelier Certificato - Giugno 2026, Vercelli")).toMatchObject({
      type: "certificato",
      month: 6,
      year: 2026,
    });
  });

  // ── Genuinely un-parseable: events / no type / no month or year. ──
  it("returns null for an event product (no course type)", () => {
    expect(parseCourseTitle("Incontro con il produttore - Kenbishi")).toBeNull();
    expect(parseCourseTitle("Sake Experience")).toBeNull();
  });

  it("returns null when the title has a type+month but no year", () => {
    expect(
      parseCourseTitle("Sake Sommelier Certificato - 17, 18 e 19 Giugno - Castelfranco Veneto"),
    ).toBeNull();
  });

  // ── Pre-2024 stays with the historical import (avoid duplicating it). ──
  it("returns null for a 2023 course (left to the historical import)", () => {
    expect(parseCourseTitle("Introduzione al Sake - 18 Settembre 2023 - Milano")).toBeNull();
  });
});

describe("parseCourseFromMetafields (tag-based type)", () => {
  // Real ACTIVE product silently skipped before tags entered the type chain:
  // free-worded title + tipologia "Approfondimento", but staff-tagged Masterclass.
  it('parses "Pillole di sake - Doburoku" via tags + event-date metafield', () => {
    expect(
      parseCourseFromMetafields("Pillole di sake - Doburoku", "Masterclass, ONLINE", {
        tipologia_di_corso: "Approfondimento",
        luogo_e_orari: "🗓️ 3 novembre 2026\n\n📍Online (Zoom)\n\n🕒 Dalle 19.30 alle 21.00",
        termine_iscrizioni: "3 novembre 2026",
        luogo: "Online",
      }),
    ).toMatchObject({ type: "masterclass", month: 11, year: 2026, day: 3, delivery: "online", city: "Online" });
  });

  it('parses "Bartending & Spirits of Japan" via the Mixology tag', () => {
    expect(
      parseCourseFromMetafields("Bartending & Spirits of Japan - Gennaio 2025, Milano", "Mixology", {
        luogo_e_orari: "🗓️ 20 Gennaio 2025\n📍Milano",
      }),
    ).toMatchObject({ type: "mixology", month: 1, year: 2025, day: 20 });
  });

  it("enforces the 2024+ floor on the metafields path too (historical boundary)", () => {
    expect(
      parseCourseFromMetafields("Introduzione al Sake - Milano", "Corso introduttivo", {
        luogo_e_orari: "🗓️ 18 settembre 2023\n📍Milano",
      }),
    ).toBeNull();
  });

  it("still rejects event products (tag 'Event', no course type anywhere)", () => {
    expect(
      parseCourseFromMetafields("Incontro con il produttore - Kenbishi", "Event", {}),
    ).toBeNull();
    expect(parseCourseFromMetafields("Sake Experience", "", {})).toBeNull();
  });
});

describe("detectType", () => {
  it("detects each level regardless of spacing/case", () => {
    expect(detectType("Master Class sul riso")).toBe("masterclass");
    expect(detectType("SHOCHU professional")).toBe("shochu");
    expect(detectType("Sake Sommelier Certificato")).toBe("certificato");
    expect(detectType("Introduzione al Sake")).toBe("introduttivo");
    expect(detectType("Degustazione online")).toBeNull();
  });
});
