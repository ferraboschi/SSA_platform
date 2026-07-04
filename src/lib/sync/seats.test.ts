import { describe, it, expect } from "vitest";
import { planSeats, placeholderEmail, placeholderName } from "./seats";

describe("planSeats — revenue invariant", () => {
  it("single ticket → one seat with the full amount", () => {
    expect(planSeats(1, 15000)).toEqual([{ seatIndex: 1, amountCents: 15000 }]);
  });
  it("multi-ticket → N seats, ALL amount on seat 1, rest €0", () => {
    const seats = planSeats(2, 30000);
    expect(seats).toEqual([
      { seatIndex: 1, amountCents: 30000 },
      { seatIndex: 2, amountCents: 0 },
    ]);
    // The invariant: total across seats == the line amount (revenue unchanged).
    expect(seats.reduce((s, x) => s + x.amountCents, 0)).toBe(30000);
  });
  it("clamps a bad qty to at least one seat", () => {
    expect(planSeats(0, 5000)).toHaveLength(1);
    expect(planSeats(-3, 5000)).toHaveLength(1);
  });
  it("Anna Salvagno case: Intro Online, 2 tickets, €300 → 2 rows, revenue €300", () => {
    const seats = planSeats(2, 30000);
    expect(seats).toHaveLength(2);
    expect(seats.reduce((s, x) => s + x.amountCents, 0)).toBe(30000);
  });
});

describe("placeholder identity", () => {
  it("deterministic email per order/line/seat (idempotent re-sync)", () => {
    expect(placeholderEmail(111, 222, 2)).toBe("seat-111-222-2@placeholder.ssa");
    expect(placeholderEmail(111, 222, 2)).toBe(placeholderEmail(111, 222, 2));
    expect(placeholderEmail(111, 222, 2)).not.toBe(placeholderEmail(111, 222, 3));
  });
  it("readable seat label", () => {
    expect(placeholderName(2)).toContain("Posto 2");
  });
});
