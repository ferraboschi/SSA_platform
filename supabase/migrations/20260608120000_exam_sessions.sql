-- Resumable, proctored exam sessions.
--
-- Persists each student's IN-PROGRESS exam — admission status + answers +
-- position + elapsed time — so a logout / refresh / lost connection resumes
-- EXACTLY where they were, until the final submission. One row per
-- (exam-link token × enrolled student).
--
-- Flow: student opens the class link → picks their name (check-in) → waits in
-- the "sala d'attesa" → educator admits (verifying identity on Zoom) → exam
-- unlocks. Every answer change is saved here; reconnect restores from here.
--
-- Service-role only: RLS is enabled with NO public policy (the public exam route
-- reads/writes via the service key, like exam_submissions). Safe to re-run.

create table if not exists public.exam_sessions (
  id              bigint generated always as identity primary key,
  token           text not null,            -- the class exam-link token (course+test)
  course_ref      text not null,            -- token course id (numeric string)
  corso_id        bigint references public.corsi(id) on delete set null,
  test_key        text not null,            -- final / day1.. / feedback
  corsista_id     bigint references public.corsisti(id) on delete set null,
  student_name    text not null,
  status          text not null default 'checked_in',  -- checked_in | admitted | submitted
  lang            text,
  current_idx     int not null default 0,
  answers         jsonb not null default '{}'::jsonb,   -- { questionId/reg:field : value }
  elapsed_seconds int not null default 0,
  checked_in_at   timestamptz not null default now(),
  admitted_at     timestamptz,
  submitted_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (token, corsista_id)
);

create index if not exists exam_sessions_token_idx on public.exam_sessions (token, status);
create index if not exists exam_sessions_course_idx on public.exam_sessions (corso_id, test_key);

-- Per-session bearer secret. The class exam-link token is shared with the WHOLE
-- class (pasted in the Zoom chat), and the roster endpoint exposes every
-- corsista_id — so (token, corsista_id) alone is enumerable. The server hands
-- this unguessable secret to the student ONLY at check-in; every later
-- read/save/submit must present it. Stops a classmate from silently
-- reading/wiping/submitting another student's in-progress session via the API.
-- (Identity at admission is still gated by the educator on Zoom video.)
-- Idempotent: safe to run whether or not the column already exists.
alter table public.exam_sessions
  add column if not exists session_secret uuid not null default gen_random_uuid();

alter table public.exam_sessions enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the exam route and
-- the educator admission panel both go through the service-role key.

-- Backstop against a double final-submission writing two graded rows for the
-- same student+test. The app already claims the session atomically before
-- inserting (claim-first), so this is defense-in-depth. Created ONLY when no
-- duplicate proctored submission already exists, so the migration can never fail
-- on legacy data — and we NEVER delete the dupes (mai buttare dati): we just log
-- and skip, leaving the app-level guard in charge.
do $$
begin
  if exists (
    select 1
    from (
      select corso_id, corsista_id, test_key, count(*) as c
      from public.exam_submissions
      where mode = 'exam' and corsista_id is not null
      group by corso_id, corsista_id, test_key
    ) d
    where d.c > 1
  ) then
    raise notice 'exam_submissions: duplicate proctored rows exist — skipping unique index, app-level claim-first guards submissions.';
  else
    create unique index if not exists exam_submissions_proctored_uniq
      on public.exam_submissions (corso_id, corsista_id, test_key)
      where mode = 'exam' and corsista_id is not null;
  end if;
end $$;
