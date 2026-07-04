-- Reusable exam-question categories (owner: avoid free-text duplicates/typos
-- like "Storia" vs "storia" across day1/day2/day3/esame finale). One flat list
-- per family (certificato/shochu), staff pick from it or type a new one — the
-- editor upserts a typed value here so it's reusable everywhere from then on.
--
-- This is deliberately separate from the OLD hardcoded NIHONSHU_CATS/SHOCHU_CATS
-- (src/lib/domain/constants.ts), which stays untouched — it only backs the
-- ExamTemplate.finalExam.cats count shown in the editor header, not live
-- selection anymore.

create table if not exists public.exam_categories (
  id         bigint generated always as identity primary key,
  family     text not null check (family in ('certificato','shochu')),
  label      text not null,
  created_at timestamptz not null default now(),
  unique (family, label)
);

create index if not exists exam_categories_family_idx on public.exam_categories (family);

alter table public.exam_categories enable row level security;
-- Staff-only admin table (same posture as exam_templates: no public policy).
-- The app's Supabase client used for reads here is the normal authenticated
-- session client the rest of the admin app already uses; writes route through
-- the service-role client, matching exam_templates.save().

-- Seed with the current hardcoded labels so the combobox isn't empty on first
-- use. Existing per-question `cat` values (old slugs like "storia") are left
-- untouched — the owner is actively re-editing every question already.
insert into public.exam_categories (family, label)
values
  ('certificato', 'Storia & Cultura'),
  ('certificato', 'Produzione & Tecnica'),
  ('certificato', 'Varietà & Stili'),
  ('certificato', 'Degustazione & Sensoriale'),
  ('certificato', 'Servizio & Pairing'),
  ('shochu', 'Storia & Tradizione'),
  ('shochu', 'Produzione & Distillazione'),
  ('shochu', 'Ingredienti & Koji'),
  ('shochu', 'Degustazione'),
  ('shochu', 'Servizio & Cocktail')
on conflict (family, label) do nothing;
