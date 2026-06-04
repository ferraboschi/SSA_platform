-- Personal per-student exam links + link each submission back to the enrolled
-- student. Safe to run multiple times (IF NOT EXISTS guards). The app degrades
-- gracefully until this is applied: shared links keep working, and submissions
-- are still saved (the corsista_id write is retried without the column).

-- One personal, signed link per enrolled student × test.
create table if not exists public.exam_student_links (
  id           bigint generated always as identity primary key,
  corso_id     bigint not null references public.corsi(id) on delete cascade,
  corsista_id  bigint not null references public.corsisti(id) on delete cascade,
  test_key     text not null,
  mode         text not null default 'exam',
  token        text not null unique,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (corso_id, corsista_id, test_key, mode)
);
create index if not exists exam_student_links_course_idx
  on public.exam_student_links (corso_id, test_key);

-- Tie a submission to the student whose personal link was used.
alter table public.exam_submissions
  add column if not exists corsista_id bigint references public.corsisti(id);

-- Server access is via the service role (bypasses RLS); enable RLS with no
-- public policy so anon/auth clients can't read the link registry.
alter table public.exam_student_links enable row level security;
