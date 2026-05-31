-- Add structured fields from the official exam roster format (BOCCIATI.xlsx
-- and equivalent per-course rosters): person demographics on `corsisti`,
-- exam-sitting details on `corsi_iscrizioni`.
--
-- Idempotent: every column uses `add column if not exists`.

-- ── Person demographics (one per person) ──────────────────────────────────────
alter table public.corsisti
  add column if not exists nationality text,
  add column if not exists gender      text,   -- 'M' | 'F' | 'NB'
  add column if not exists birth_date  date,
  add column if not exists occupation  text,
  add column if not exists residency   text;   -- residence / address line

-- ── Exam-sitting details (one per enrollment / exam attempt) ──────────────────
alter table public.corsi_iscrizioni
  add column if not exists exam_score  numeric(5,2),  -- e.g. 0.61, 73.00
  add column if not exists exam_date   date,
  add column if not exists exam_venue  text,
  add column if not exists exam_note   text;

-- Helpful indexes for filtering/reporting.
create index if not exists corsisti_nationality_idx on public.corsisti (nationality);
create index if not exists corsi_iscrizioni_exam_date_idx on public.corsi_iscrizioni (exam_date);
