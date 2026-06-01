-- Participant de-duplication, non-destructively.
--
-- `merged_into`: when set, this corsista is a duplicate that was folded into
-- another (the "primary"). The record is KEPT (never deleted — mai buttare
-- dati) but hidden from lists. `diploma_numbers`: certification numbers
-- preserved on the primary when diploma-only placeholder stubs are merged in.
alter table public.corsisti
  add column if not exists merged_into bigint references public.corsisti(id) on delete set null;
alter table public.corsisti
  add column if not exists diploma_numbers text[] not null default '{}';

create index if not exists corsisti_merged_into_idx on public.corsisti(merged_into);
