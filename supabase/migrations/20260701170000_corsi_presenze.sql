-- Roll-call attendance ("appello") for the educator SHARE LINK.
--
-- The read-only educator share link (/condividi/[token]) lets the educator take
-- attendance: one boolean per (course × enrolled student × course day). A
-- 3-day Certificato has day_no 1..3; a 1-day course has day_no 1. One row per
-- (corso_id, corsista_id, day_no) — the unique key drives the upsert.
--
-- Service-role only: RLS is enabled with NO public policy, identical to
-- exam_sessions (20260608120000). The public share route writes via the
-- service-role key (attendance-actions.ts), which re-verifies the signed token,
-- derives the course from it, enforces enrollment, bounds day_no, and
-- rate-limits by token before touching this table. anon/auth clients cannot see
-- or write it. Idempotent — safe to re-run.

create table if not exists public.corsi_presenze (
  id           bigint generated always as identity primary key,
  corso_id     bigint not null references public.corsi(id) on delete cascade,
  corsista_id  bigint not null references public.corsisti(id) on delete cascade,
  day_no       int not null,
  present      boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (corso_id, corsista_id, day_no)
);

create index if not exists corsi_presenze_corso_idx on public.corsi_presenze (corso_id);

alter table public.corsi_presenze enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the share-link
-- attendance actions go exclusively through the service-role key.
