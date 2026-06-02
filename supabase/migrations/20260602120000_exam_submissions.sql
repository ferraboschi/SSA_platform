-- Exam submissions: persists what the public tokenized exam runner collects.
-- Without this table the "real exam" link silently discarded every answer.
-- Only the service role writes/reads (the public route is RLS-blocked for anon).

create table if not exists public.exam_submissions (
  id            bigint generated always as identity primary key,
  corso_id      bigint references public.corsi(id) on delete set null,
  course_ref    text,                       -- token course id (numeric string)
  test_key      text not null,              -- final / day1.. / feedback
  mode          text not null,              -- exam / test / validate
  lang          text,
  elapsed_seconds int,
  answers       jsonb not null default '{}'::jsonb,  -- { questionId: value }
  registration  jsonb,                      -- name/gender/nationality/email/phone/address
  created_at    timestamptz not null default now()
);

create index if not exists exam_submissions_corso_idx on public.exam_submissions (corso_id);
create index if not exists exam_submissions_created_idx on public.exam_submissions (created_at desc);

alter table public.exam_submissions enable row level security;
-- No policies on purpose: anon/auth clients cannot touch it; the public exam
-- route writes via the service-role key (bypasses RLS).
