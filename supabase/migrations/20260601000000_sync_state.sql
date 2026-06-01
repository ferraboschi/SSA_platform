-- Tracks the incremental-sync watermark per external source (e.g. Shopify).
-- One row per source; `last_synced_at` is the high-water mark the next run
-- pulls changes from. `last_summary` keeps the most recent run's counters.
create table if not exists public.sync_state (
  source         text primary key,
  last_synced_at timestamptz,
  last_summary   jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table public.sync_state enable row level security;

-- Staff may read sync status in the UI; writes happen via the service role
-- (server action / cron), which bypasses RLS.
drop policy if exists sync_state_read on public.sync_state;
create policy sync_state_read on public.sync_state
  for select using (public.is_staff());
