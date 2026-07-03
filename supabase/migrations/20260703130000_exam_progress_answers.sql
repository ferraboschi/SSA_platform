-- Live-progress detail (owner's round 3): the expanded student row shows the
-- number of CORRECT and WRONG answers so far. The runner already reports
-- progress; it now includes the current answers snapshot, graded on READ by
-- the educator action (pure gradeAnswers — nothing stored but the raw json).
--
-- Additive + idempotent; degrades gracefully (no column → counts omitted).

alter table public.exam_progress
  add column if not exists answers jsonb;
