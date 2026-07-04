-- Multi-person purchase support: a staff-editable seat count per enrollment.
--
-- Detection background: an order line with quantity 2 (one person paying for
-- two) becomes ONE purchases row (quantity=2, amount=2×price). The roster
-- infers the seat count from purchases.quantity; this column lets staff OVERRIDE
-- that inference when the automatic value is wrong (odd discounts, B2B, a paid
-- seat the buyer decides not to fill, etc.).
--
-- NULL  → use the inferred count (sum of purchases.quantity for this buyer+course).
-- >= 1  → the staff-chosen number of seats this enrollment covers.
--
-- The number of "da compilare" companion slots shown at check-in is
-- (effective_seats - 1 - existing companions). Additive + IF NOT EXISTS, so the
-- roster keeps working on a DB where this migration hasn't run yet (readers fall
-- back to the inferred count).

alter table public.corsi_iscrizioni
  add column if not exists seats_override int
    check (seats_override is null or seats_override >= 1);

comment on column public.corsi_iscrizioni.seats_override is
  'Staff override of the inferred seat count (NULL = use sum of purchases.quantity).';
