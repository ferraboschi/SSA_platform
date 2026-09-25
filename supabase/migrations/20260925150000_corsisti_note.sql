-- Staff/educator notes on a student ("ripete", "deve fare l'esame", …).
-- Owner 25/9/2026: written by the organizers (platform) OR the educator
-- (share page), visible ONLY to them — never to students. One row per note
-- (author + timestamp), soft-deleted (deleted_at) per the never-throw-data
-- rule. corso_id is the course the note was written from (nullable: a note
-- can be about the person, not a course). Same RLS posture as every sibling
-- table: staff may read/write with the session client; the educator share
-- page goes through the service role (token-bound, course-bound actions).
-- Additive + IF NOT EXISTS: until applied, notes are simply unavailable
-- (readers return none, writers report the missing migration).

create table if not exists public.corsisti_note (
  id           bigint generated always as identity primary key,
  corsista_id  bigint not null references public.corsisti(id) on delete cascade,
  corso_id     bigint references public.corsi(id) on delete set null,
  text         text not null check (char_length(text) between 1 and 1000),
  author       text not null,
  author_role  text not null check (author_role in ('staff', 'educator')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists corsisti_note_corsista_idx
  on public.corsisti_note (corsista_id) where deleted_at is null;
create index if not exists corsisti_note_corso_idx
  on public.corsisti_note (corso_id) where deleted_at is null;

alter table public.corsisti_note enable row level security;
drop policy if exists corsisti_note_select on public.corsisti_note;
drop policy if exists corsisti_note_insert on public.corsisti_note;
drop policy if exists corsisti_note_update on public.corsisti_note;
drop policy if exists corsisti_note_delete on public.corsisti_note;
create policy corsisti_note_select on public.corsisti_note
  for select to authenticated using (true);
create policy corsisti_note_insert on public.corsisti_note
  for insert to authenticated with check (public.is_staff());
create policy corsisti_note_update on public.corsisti_note
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy corsisti_note_delete on public.corsisti_note
  for delete to authenticated using (public.is_staff());
