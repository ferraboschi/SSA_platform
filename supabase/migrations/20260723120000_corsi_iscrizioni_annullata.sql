-- Per-student cancellation ("annullata") on a live course enrollment.
--
-- When a student can't attend, staff remove them from the course with one of two
-- outcomes: a REFUND (money handled manually in Shopify) or a CREDIT (a
-- corsi_crediti row, redeemable on a same-level course via a Shopify code). The
-- enrollment is NOT deleted — it's marked annullata so the trace (order, amount,
-- date) survives for audit and to key the credit's origin. Every active-roster /
-- revenue / stats reader filters `annullata_at IS NULL` (in the pure aggregations),
-- so an annullata seat leaves the roster and the collected revenue.
--
-- Additive + idempotent: nullable columns with a guarded CHECK; safe to re-run.

alter table public.corsi_iscrizioni
  add column if not exists annullata_at  timestamptz,
  add column if not exists annullata_tipo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'corsi_iscrizioni_annullata_tipo_chk'
  ) then
    alter table public.corsi_iscrizioni
      add constraint corsi_iscrizioni_annullata_tipo_chk
      check (annullata_tipo is null or annullata_tipo in ('credito','rimborso'));
  end if;
end $$;

-- Fast "active enrollments" scans (the common path filters annullata_at IS NULL).
create index if not exists corsi_iscrizioni_annullata_idx
  on public.corsi_iscrizioni (corso_id)
  where annullata_at is null;
