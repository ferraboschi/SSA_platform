-- corsisti.review_note: free-text note flagging a record for manual review
-- (e.g. phone-duplicate anomalies). Read by the Anomalie page and the main
-- corsisti listing; cleared by resolveAnomalyAction. The column already exists
-- on the live DB (applied out-of-band) — this makes the schema reproducible
-- from migrations for fresh / CI / staging databases. Idempotent no-op on prod.

alter table public.corsisti
  add column if not exists review_note text;
