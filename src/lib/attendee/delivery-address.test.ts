import { describe, it, expect } from "vitest";
import {
  EMPTY_DELIVERY_PARTS,
  composeDeliveryLine,
  isValidCivico,
  normalizeDeliveryParts,
  partsFromGooglePlace,
  partsFromLegacyLine,
  validateDeliveryParts,
  type DeliveryAddressParts,
} from "./delivery-address";

const ok: DeliveryAddressParts = normalizeDeliveryParts({
  street: "Via Ratti",
  number: "1",
  postalCode: "23849",
  city: "Rogeno",
  province: "lc",
  country: "Italia",
});

describe("isValidCivico", () => {
  it("accepts real civic numbers and SNC, never a bare CAP", () => {
    for (const v of ["1", "12", "12/B", "12b", "12 bis", "12-14", "snc", "S.N.C."]) expect(isValidCivico(v)).toBe(true);
    for (const v of ["", "20146", "Via", "12/", "1234567", "abc"]) expect(isValidCivico(v)).toBe(false);
  });
});

describe("validateDeliveryParts — every component is mandatory (owner rule 25/9)", () => {
  it("a complete Italian address passes", () => {
    expect(validateDeliveryParts(ok)).toEqual({});
  });
  it("each missing part is its own error", () => {
    const e = validateDeliveryParts(normalizeDeliveryParts({ country: "Italia" }));
    expect(Object.keys(e).sort()).toEqual(["city", "number", "postalCode", "province", "street"]);
  });
  it("Italy: CAP must be 5 digits and the province a 2-letter sigla", () => {
    expect(validateDeliveryParts({ ...ok, postalCode: "2384" }).postalCode).toMatch(/5 cifre/);
    expect(validateDeliveryParts({ ...ok, province: "Lecco" }).province).toMatch(/2 lettere/);
  });
  it("abroad: province optional, postal code free-form", () => {
    const ch = normalizeDeliveryParts({ ...ok, province: "", postalCode: "6900", country: "Svizzera", countryCode: "CH" });
    expect(validateDeliveryParts(ch)).toEqual({});
    const uk = normalizeDeliveryParts({ ...ok, province: "", postalCode: "SW1A 1AA", country: "Regno Unito", countryCode: "GB" });
    expect(validateDeliveryParts(uk)).toEqual({});
  });
  it("a civic number typed at the end of the street is refused when the number field is empty", () => {
    expect(validateDeliveryParts({ ...ok, street: "Via Ratti 1", number: "" }).street).toMatch(/numero civico/);
  });
  it("a bare CAP cannot pass as the civic number", () => {
    expect(validateDeliveryParts({ ...ok, number: "23849" }).number).toBeDefined();
  });
});

describe("composeDeliveryLine", () => {
  it("prints the canonical label line", () => {
    expect(composeDeliveryLine(ok)).toBe("Via Ratti 1, 23849 Rogeno LC, Italia");
    expect(composeDeliveryLine({ ...ok, province: "" })).toBe("Via Ratti 1, 23849 Rogeno, Italia");
    expect(composeDeliveryLine({ ...ok, number: "SNC" })).toBe("Via Ratti SNC, 23849 Rogeno LC, Italia");
  });
});

describe("normalizeDeliveryParts", () => {
  it("trims, collapses, uppercases the sigla and the country code, infers IT", () => {
    const p = normalizeDeliveryParts({ street: "  via  Ratti ", number: " snc", postalCode: "23849", city: "Rogeno", province: "lc", country: "Italia" });
    expect(p).toMatchObject({ street: "via Ratti", number: "SNC", province: "LC", countryCode: "IT", source: "manual" });
  });
});

describe("partsFromGooglePlace", () => {
  const comps = [
    { types: ["street_number"], long_name: "1", short_name: "1" },
    { types: ["route"], long_name: "Via Ratti", short_name: "Via Ratti" },
    { types: ["locality", "political"], long_name: "Rogeno", short_name: "Rogeno" },
    { types: ["administrative_area_level_3", "political"], long_name: "Rogeno", short_name: "Rogeno" },
    { types: ["administrative_area_level_2", "political"], long_name: "Provincia di Lecco", short_name: "LC" },
    { types: ["administrative_area_level_1", "political"], long_name: "Lombardia", short_name: "Lombardia" },
    { types: ["country", "political"], long_name: "Italia", short_name: "IT" },
    { types: ["postal_code"], long_name: "23849", short_name: "23849" },
  ];
  it("maps an Italian place to complete parts (province = sigla)", () => {
    const p = partsFromGooglePlace(comps, "Via Ratti, 1, 23849 Rogeno LC, Italia", "pid");
    expect(p).toMatchObject({ street: "Via Ratti", number: "1", postalCode: "23849", city: "Rogeno", province: "LC", country: "Italia", countryCode: "IT", source: "google", placeId: "pid" });
    expect(validateDeliveryParts(p)).toEqual({});
    expect(composeDeliveryLine(p)).toBe("Via Ratti 1, 23849 Rogeno LC, Italia");
  });
  it("a place without a street number leaves the number EMPTY (the student must add it)", () => {
    const p = partsFromGooglePlace(comps.filter((c) => !c.types.includes("street_number")));
    expect(p.number).toBe("");
    expect(validateDeliveryParts(p).number).toBeDefined();
  });
  it("abroad: province = state short name, CAP free-form", () => {
    const p = partsFromGooglePlace([
      { types: ["street_number"], long_name: "10", short_name: "10" },
      { types: ["route"], long_name: "Downing Street", short_name: "Downing St" },
      { types: ["postal_town"], long_name: "London", short_name: "London" },
      { types: ["administrative_area_level_1", "political"], long_name: "England", short_name: "England" },
      { types: ["country", "political"], long_name: "Regno Unito", short_name: "GB" },
      { types: ["postal_code"], long_name: "SW1A 2AA", short_name: "SW1A 2AA" },
    ]);
    expect(p).toMatchObject({ city: "London", province: "England", countryCode: "GB", postalCode: "SW1A 2AA" });
    expect(validateDeliveryParts(p)).toEqual({});
  });
});

describe("partsFromLegacyLine — best-effort prefill of a saved one-line address", () => {
  it("Google's Italian format", () => {
    expect(partsFromLegacyLine("Via Ratti, 1, 23849 Rogeno LC, Italia")).toMatchObject({
      street: "Via Ratti", number: "1", postalCode: "23849", city: "Rogeno", province: "LC", country: "Italia",
    });
  });
  it("hand-typed 'Via Roma 12, 20100 Milano'", () => {
    expect(partsFromLegacyLine("Via Roma 12, 20100 Milano")).toMatchObject({
      street: "Via Roma", number: "12", postalCode: "20100", city: "Milano",
    });
  });
  it("our own canonical line round-trips", () => {
    const p = partsFromLegacyLine(composeDeliveryLine(ok));
    expect(p).toMatchObject({ street: "Via Ratti", number: "1", postalCode: "23849", city: "Rogeno", province: "LC", country: "Italia" });
  });
  it("an incomplete line leaves the unknown parts empty (never guessed)", () => {
    const p = partsFromLegacyLine("Via don mario casati 6");
    expect(p).toMatchObject({ street: "Via don mario casati", number: "6" });
    expect(p.postalCode).toBeUndefined();
    expect(p.city).toBeUndefined();
    expect(partsFromLegacyLine("")).toEqual({});
  });
});

describe("review blockers — foreign addresses typed by hand, Japanese blocks", () => {
  it("a Swiss address typed by hand (no countryCode) is validated as Swiss, not Italian", () => {
    const p = normalizeDeliveryParts({ street: "Via Nassa", number: "5", postalCode: "6900", city: "Lugano", province: "", country: "Svizzera" });
    expect(p.countryCode).toBeUndefined();
    expect(validateDeliveryParts(p)).toEqual({});
  });
  it("a stale 'IT' code cannot override the typed country (client set() + server normalize)", () => {
    const p = normalizeDeliveryParts({ ...EMPTY_DELIVERY_PARTS, street: "Via Nassa", number: "5", postalCode: "6900", city: "Lugano", country: "Svizzera", countryCode: "IT" });
    expect(validateDeliveryParts(p)).toEqual({});
    // Google pick of an Italian place, then the country edited by hand → manual rules follow the text.
    const g = partsFromGooglePlace([
      { types: ["street_number"], long_name: "5", short_name: "5" },
      { types: ["route"], long_name: "Via Nassa", short_name: "Via Nassa" },
      { types: ["locality"], long_name: "Lugano", short_name: "Lugano" },
      { types: ["country"], long_name: "Italia", short_name: "IT" },
      { types: ["postal_code"], long_name: "23849", short_name: "23849" },
    ]);
    const edited = normalizeDeliveryParts({ ...g, country: "Svizzera", postalCode: "6900", province: "", source: "manual", countryCode: undefined });
    expect(validateDeliveryParts(edited)).toEqual({});
  });
  it("a legacy Swiss line pre-fills and validates without the Italian rules", () => {
    const p = normalizeDeliveryParts({ ...EMPTY_DELIVERY_PARTS, ...partsFromLegacyLine("Via Nassa 5, 6900 Lugano, Svizzera") });
    expect(p).toMatchObject({ street: "Via Nassa", number: "5", postalCode: "6900", city: "Lugano", country: "Svizzera" });
    expect(validateDeliveryParts(p)).toEqual({});
  });
  it("Japanese block numbers pass (civico.ts used to accept '1-2-3 Ginza')", () => {
    for (const v of ["1-2-3", "2-11-3", "3-1-1"]) expect(isValidCivico(v)).toBe(true);
    const p = normalizeDeliveryParts({ street: "Ginza", number: "1-2-3", postalCode: "104-0061", city: "Chuo-ku", province: "Tokyo", country: "Giappone" });
    expect(validateDeliveryParts(p)).toEqual({});
    expect(partsFromLegacyLine("1-2-3 Ginza, Chuo-ku, Tokyo, Giappone")).toMatchObject({ number: "1-2-3", street: "Ginza", country: "Giappone" });
    expect(partsFromLegacyLine("10 Downing Street, London, Regno Unito")).toMatchObject({ number: "10", street: "Downing Street", country: "Regno Unito" });
  });
  it("a two-segment legacy line keeps the second segment as the CITY, not the country", () => {
    const p = partsFromLegacyLine("Via Roma 12, Milano");
    expect(p.city).toBe("Milano");
    expect(p.country).toBeUndefined();
  });
  it("audit fields are bounded, a bogus country code is dropped", () => {
    const p = normalizeDeliveryParts({ ...EMPTY_DELIVERY_PARTS, source: "google", countryCode: "ITALY", placeId: "x".repeat(500), formatted: "y".repeat(500) });
    expect(p.countryCode).toBe("IT"); // derived from the text, not the bogus code
    expect(p.placeId).toHaveLength(200);
    expect(p.formatted).toHaveLength(300);
  });
});

describe("5-digit house numbers", () => {
  it("are accepted abroad (US) but never in Italy (that is a CAP in the wrong field)", () => {
    const us = normalizeDeliveryParts({ street: "Santa Monica Blvd", number: "10000", postalCode: "90067", city: "Los Angeles", province: "CA", country: "Stati Uniti" });
    expect(validateDeliveryParts(us)).toEqual({});
    const it = normalizeDeliveryParts({ street: "Via Roma", number: "20100", postalCode: "20100", city: "Milano", province: "MI", country: "Italia" });
    expect(validateDeliveryParts(it).number).toBeDefined();
  });
});
