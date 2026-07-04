-- F4: multi-ticket purchases become FULL enrollment rows. A Shopify course line
-- with quantity=N now yields N corsi_iscrizioni rows: seat 1 = the buyer (full
-- amount), seats 2..N = a PLACEHOLDER enrollee ("Posto k — da completare", €0)
-- to be filled in later. Placeholder attendees are distinct corsisti (synthetic
-- email), so the existing unique(corso_id, corsista_id) still holds — no
-- constraint change, no nullable columns, no reader touched for correctness.
--
-- Additive + degrades gracefully: until this runs, the sync keeps its old
-- one-row-per-line behaviour (it probes for seat_index before expanding seats).

alter table public.corsi_iscrizioni
  add column if not exists seat_index int not null default 1;

-- Placeholder corsisti (unfilled seats): excluded from the corsisti list, count
-- and exports; visible only inside their course roster as "da completare".
alter table public.corsisti
  add column if not exists placeholder boolean not null default false;

-- Per-seat idempotency guard for the sync's upsert (a re-sync updates the same
-- seat row). line_item_id is null for manual/historical rows — nulls are
-- distinct, so those are unaffected.
create unique index if not exists corsi_iscrizioni_line_seat_idx
  on public.corsi_iscrizioni (corso_id, line_item_id, seat_index)
  where line_item_id is not null;
