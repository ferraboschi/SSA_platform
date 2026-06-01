-- Cluster marker for contacts that don't belong to the course platform on their
-- own — e.g. people who only attended a "Sake Experience" event. They are KEPT
-- (mai buttare dati) but hidden from the main Corsisti list by default, with a
-- toggle to include them.
alter table public.corsisti add column if not exists cluster text;
create index if not exists corsisti_cluster_idx on public.corsisti(cluster);
