-- Two additive pieces for the educator flow (owner's field-test round 2):
--
-- 1) CONFIRM-SENT state: the Verifica email tab distinguishes three states —
--    "mail non confermata" (nothing sent), "mail non ancora confermata"
--    (confirmation SENT, student hasn't clicked yet), "mail confermata".
--    The middle state needs a timestamp: confirm_sent_at.
--
-- 2) LIVE EXAM PROGRESS: while a student takes a test from their personal
--    link, the educator sees a progress bar (question X of Y, start time,
--    last update, submitted). The runner saves lightweight progress rows here.
--    RLS-locked, service-role only (same posture as corsi_presenze): the
--    public writes go through token-verified server actions.
--
-- Additive + IF NOT EXISTS, degrades gracefully until applied. Idempotent.

alter table public.corsi_iscrizioni
  add column if not exists confirm_sent_at timestamptz;

alter table public.corsi_partecipanti
  add column if not exists confirm_sent_at timestamptz;

create table if not exists public.exam_progress (
  id               bigint generated always as identity primary key,
  corso_id         bigint not null references public.corsi(id) on delete cascade,
  test_key         text   not null,
  corsista_id      bigint references public.corsisti(id) on delete cascade,
  partecipante_id  bigint references public.corsi_partecipanti(id) on delete cascade,
  current_idx      int    not null default 0,
  total            int    not null default 0,
  elapsed_seconds  int    not null default 0,
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  updated_at       timestamptz not null default now(),
  -- exactly one subject, mirroring exam_submissions
  constraint exam_progress_subject_xor
    check (not (corsista_id is not null and partecipante_id is not null))
);

create unique index if not exists exam_progress_corsista_uniq
  on public.exam_progress (corso_id, test_key, corsista_id)
  where corsista_id is not null;
create unique index if not exists exam_progress_partecipante_uniq
  on public.exam_progress (corso_id, test_key, partecipante_id)
  where partecipante_id is not null;
create index if not exists exam_progress_corso_idx on public.exam_progress (corso_id, test_key);

alter table public.exam_progress enable row level security;
-- No policies on purpose: service-role only via token-verified actions.
