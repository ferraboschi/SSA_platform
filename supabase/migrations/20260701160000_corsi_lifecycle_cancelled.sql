-- Course lifecycle is inherited from Shopify + the course date. The model gained a
-- "cancelled" value (a course annulled before its date — pulled from Shopify while
-- still upcoming). Allow it in the existing CHECK constraint.
--
-- Additive + idempotent (drop-if-exists / re-add) → safe to run before the code
-- deploy and re-runnable. No data is changed; existing rows keep their value.
-- ("archiviato" is kept in the allowed set for backward-compat with any legacy row;
--  the app no longer produces it — it's folded into passato/cancelled at read time.)

alter table public.corsi drop constraint if exists corsi_lifecycle_check;
alter table public.corsi add constraint corsi_lifecycle_check
  check (lifecycle in ('pubblicato', 'bozza', 'archiviato', 'passato', 'cancelled'));
