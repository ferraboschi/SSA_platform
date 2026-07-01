-- Companion participants ("doppio") for a course enrollment.
--
-- corsi_iscrizioni has UNIQUE (corso_id, corsista_id): one enrollment per person
-- per course, regardless of how many seats they bought. A buyer of 2+ seats is a
-- single roster line, yet the extra attendee(s) need their OWN roll-call line.
-- This table stores those extra attendees (name + phone), tied to the buyer's
-- enrollment, so the appello (corsi_presenze) can reference EITHER a corsista OR
-- a companion.
--
-- Service-role only: RLS is enabled with NO public policy, identical to
-- corsi_presenze (20260701170000) and exam_sessions. Writes go exclusively
-- through the service-role key:
--   • The PUBLIC educator share link may only fill a KNOWN-EMPTY companion slot
--     on an enrollment already flagged as a "doppio" (seatsBought >= 2), and the
--     enrollment must belong to the token's course — it can never create
--     arbitrary people (attendance-actions.ts).
--   • The INTERNAL path is role-guarded (admin/manager) and may add companions
--     for any enrollment on the course (partecipanti-actions.ts).
-- Idempotent — safe to re-run.

create table if not exists public.corsi_partecipanti (
  id             bigint generated always as identity primary key,
  corso_id       bigint not null references public.corsi(id) on delete cascade,
  iscrizione_id  bigint references public.corsi_iscrizioni(id) on delete cascade,
  full_name      text not null,
  phone          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists corsi_partecipanti_corso_idx on public.corsi_partecipanti (corso_id);

alter table public.corsi_partecipanti enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the companion
-- actions go exclusively through the service-role key.

-- ── Extend corsi_presenze so a presence row references EITHER a corsista OR a
--    companion (exactly one of the two). ────────────────────────────────────
alter table public.corsi_presenze
  add column if not exists partecipante_id bigint
    references public.corsi_partecipanti(id) on delete cascade;

-- A companion presence row has no corsista_id, so the column can no longer be
-- NOT NULL. The XOR check below still guarantees exactly one subject is set.
alter table public.corsi_presenze alter column corsista_id drop not null;

-- One presence row per (course × companion × day). The existing
-- unique (corso_id, corsista_id, day_no) covers corsista rows; this partial
-- index covers companion rows (corsista_id is NULL there).
create unique index if not exists corsi_presenze_partecipante_uidx
  on public.corsi_presenze (corso_id, partecipante_id, day_no)
  where partecipante_id is not null;

-- EXACTLY ONE of corsista_id / partecipante_id must be set. Added NOT VALID so
-- the migration never fails on any pre-existing row; new/updated rows are
-- enforced immediately. Validate later once existing rows are known-clean:
--   alter table public.corsi_presenze validate constraint corsi_presenze_subject_xor;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'corsi_presenze_subject_xor'
  ) then
    alter table public.corsi_presenze
      add constraint corsi_presenze_subject_xor
      check ((corsista_id is not null) <> (partecipante_id is not null))
      not valid;
  end if;
end $$;
