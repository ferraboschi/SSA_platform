-- Per-enrollment exam score percentage (0–100), shown next to the student name.
-- Sourced from Airtable Students "Score, %" (and the Dropbox xls). Nullable —
-- only set where a graded exam exists.
alter table public.corsi_iscrizioni
  add column if not exists exam_score_pct int;
