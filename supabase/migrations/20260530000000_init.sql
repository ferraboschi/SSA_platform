-- =============================================================================
-- SSA Platform — initial schema  (idempotent: re-runnable from scratch)
--
-- Maps the TypeScript domain model (src/lib/domain) to a normalized Postgres
-- schema. Every table that holds end-user data has Row Level Security enabled
-- with policies keyed on profiles.role (admin / manager).
--
-- This script can be applied multiple times — every CREATE is preceded by a
-- DROP IF EXISTS (in dependency order) so partial previous runs don't block
-- a clean apply. NEVER run on a database with real data without backing up;
-- the leading drops wipe the SSA tables.
--
-- Conventions
-- - All IDs are bigint identity, surfaced as `id`. External keys from Shopify /
--   Airtable / Dropbox go in `external_*` text columns for round-tripping.
-- - `created_at` / `updated_at` everywhere, default now(), updated by trigger.
-- - Enum columns are CHECK-constrained against the same string unions used in
--   the TS enums (src/lib/domain/enums.ts) so the DB enforces the contract.
-- - RLS: authenticated users read everything; only admin/manager write.
--   This is intentional — the app is internal, not multi-tenant.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop in reverse dependency order (idempotent re-run)
-- -----------------------------------------------------------------------------

drop view  if exists public.sommeliers cascade;

drop table if exists public.rag_chunks                cascade;
drop table if exists public.rag_documents             cascade;
drop table if exists public.notifications_log         cascade;
drop table if exists public.exam_live_sessions        cascade;
drop table if exists public.exam_result_sections     cascade;
drop table if exists public.exam_results              cascade;
drop table if exists public.exam_questions            cascade;
drop table if exists public.exams                     cascade;
drop table if exists public.exam_templates            cascade;
drop table if exists public.material_template_extras  cascade;
drop table if exists public.material_template_sakes   cascade;
drop table if exists public.material_template_days    cascade;
drop table if exists public.material_templates        cascade;
drop table if exists public.corsi_iscrizioni          cascade;
drop table if exists public.corsi_sake                cascade;
drop table if exists public.corsi_giorni              cascade;
drop table if exists public.corsi                     cascade;
drop table if exists public.corsisti                  cascade;
drop table if exists public.educator_qualifications   cascade;
drop table if exists public.educators                 cascade;
drop table if exists public.settings_kv               cascade;

-- profiles cascades to its trigger on auth.users, but we drop that trigger
-- explicitly so re-runs are clean.
drop trigger if exists on_auth_user_created on auth.users;
drop table  if exists public.profiles cascade;

drop function if exists public.match_rag_chunks(vector, int, text);
drop function if exists public.handle_new_auth_user();
drop function if exists public.is_staff();
drop function if exists public.current_role();
drop function if exists public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Extensions
-- -----------------------------------------------------------------------------

create extension if not exists vector;
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 3. Pure helpers (don't reference public tables yet)
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

-- -----------------------------------------------------------------------------
-- 4. profiles — extends auth.users with app-side fields
-- -----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  first_name   text not null default '',
  last_name    text not null default '',
  display_name text generated always as (trim(both ' ' from (first_name || ' ' || last_name))) stored,
  role         text not null default 'manager' check (role in ('admin', 'manager')),
  phone        text not null default '',
  city         text not null default '',
  position     text not null default '',
  photo_url    text,
  locale       text not null default 'IT' check (locale in ('IT', 'EN', 'FR', 'JA')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 5. Auth helpers that reference profiles (must come AFTER profiles is created)
-- -----------------------------------------------------------------------------

create or replace function public.current_role()
returns text language sql stable as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select public.current_role() in ('admin', 'manager');
$$;

-- -----------------------------------------------------------------------------
-- 6. educators — people who teach courses
-- -----------------------------------------------------------------------------

create table public.educators (
  id             bigint generated always as identity primary key,
  external_id    text unique, -- prototype id (e.g. "e5") for migration
  profile_id     uuid references public.profiles(id) on delete set null,
  full_name      text not null,
  email          text,
  phone          text,
  city           text,
  bio            text,
  photo_url      text,
  languages      text[] not null default '{}',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index educators_name_idx on public.educators (lower(full_name));
create trigger educators_touch before update on public.educators
  for each row execute function public.touch_updated_at();

-- M:N — which course types an educator is qualified to teach.
create table public.educator_qualifications (
  educator_id bigint not null references public.educators(id) on delete cascade,
  course_type text not null check (course_type in ('certificato','introduttivo','masterclass','shochu','mixology')),
  primary key (educator_id, course_type)
);

-- -----------------------------------------------------------------------------
-- 7. corsisti — every student (certified or not)
-- sommeliers (certified) is a view filtered on exam_results.status='passed'
-- -----------------------------------------------------------------------------

create table public.corsisti (
  id             bigint generated always as identity primary key,
  email          text not null unique,
  full_name      text not null,
  phone          text,
  has_whatsapp   boolean not null default false,
  city           text,
  first_seen_at  timestamptz,
  historical     boolean not null default false, -- pre-platform import
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index corsisti_email_idx on public.corsisti (lower(email));
create index corsisti_name_idx on public.corsisti (lower(full_name));
create trigger corsisti_touch before update on public.corsisti
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 8. corsi — courses (core fields)
-- -----------------------------------------------------------------------------

create table public.corsi (
  id              bigint generated always as identity primary key,
  external_id     text unique, -- Shopify product id
  handle          text not null unique,
  short_title     text not null,
  full_title      text not null,
  type            text not null check (type in ('certificato','introduttivo','masterclass','shochu','mixology')),
  type_label      text not null,
  delivery_mode   text not null default 'in-person' check (delivery_mode in ('in-person','online','hybrid')),
  city            text not null,
  venue           text,
  month           text not null,
  year            int  not null,
  start_date      date,
  end_date        date,
  price_cents     int  not null default 0,
  capacity        int  not null default 0,
  min_students    int  not null default 0,
  lifecycle       text not null default 'bozza' check (lifecycle in ('pubblicato','bozza','archiviato','passato')),
  status          text,
  educator_id     bigint references public.educators(id) on delete set null,
  notebook        jsonb not null default '{}'::jsonb,
  costs           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index corsi_lifecycle_idx on public.corsi (lifecycle);
create index corsi_year_month_idx on public.corsi (year, month);
create index corsi_city_idx on public.corsi (city);
create index corsi_educator_idx on public.corsi (educator_id);
create trigger corsi_touch before update on public.corsi
  for each row execute function public.touch_updated_at();

create table public.corsi_giorni (
  id           bigint generated always as identity primary key,
  corso_id     bigint not null references public.corsi(id) on delete cascade,
  day_no       int not null,
  name         text not null,
  date         date,
  notes        text,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (corso_id, day_no)
);
create index corsi_giorni_corso_idx on public.corsi_giorni (corso_id);

create table public.corsi_sake (
  id              bigint generated always as identity primary key,
  giorno_id       bigint not null references public.corsi_giorni(id) on delete cascade,
  code            text,
  name            text not null,
  type            text,
  sakagura        text,
  size_ml         int,
  cost_cents      int not null default 0,
  qty             int not null default 1,
  note            text,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);
create index corsi_sake_giorno_idx on public.corsi_sake (giorno_id);

create table public.corsi_iscrizioni (
  id              bigint generated always as identity primary key,
  corso_id        bigint not null references public.corsi(id) on delete cascade,
  corsista_id     bigint not null references public.corsisti(id) on delete cascade,
  amount_cents    int not null default 0,
  exam_result     text check (exam_result in ('passed','retrial','failed')),
  historical      boolean not null default false,
  enrolled_at     timestamptz not null default now(),
  unique (corso_id, corsista_id)
);
create index corsi_iscrizioni_corso_idx on public.corsi_iscrizioni (corso_id);
create index corsi_iscrizioni_corsista_idx on public.corsi_iscrizioni (corsista_id);
create index corsi_iscrizioni_passed_idx on public.corsi_iscrizioni (corsista_id) where exam_result = 'passed';

-- Sommeliers view = corsisti with at least one passed exam.
create view public.sommeliers as
  select distinct c.*
  from public.corsisti c
  join public.corsi_iscrizioni i on i.corsista_id = c.id
  where i.exam_result = 'passed';

-- -----------------------------------------------------------------------------
-- 9. material_templates — library of reusable course materials
-- -----------------------------------------------------------------------------

create table public.material_templates (
  id          bigint generated always as identity primary key,
  external_id text unique,
  name        text not null,
  type        text not null check (type in ('certificato','introduttivo','masterclass','shochu','mixology')),
  description text,
  costs       jsonb not null default '{}'::jsonb,
  uses        int not null default 0,
  last_used_at timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger material_templates_touch before update on public.material_templates
  for each row execute function public.touch_updated_at();

create table public.material_template_days (
  id            bigint generated always as identity primary key,
  template_id   bigint not null references public.material_templates(id) on delete cascade,
  day_no        int not null,
  name          text not null,
  position      int not null default 0,
  unique (template_id, day_no)
);

create table public.material_template_sakes (
  id          bigint generated always as identity primary key,
  day_id      bigint not null references public.material_template_days(id) on delete cascade,
  code        text,
  name        text not null,
  type        text,
  sakagura    text,
  size_ml     int,
  cost_cents  int not null default 0,
  qty         int not null default 1,
  note        text,
  position    int not null default 0
);

create table public.material_template_extras (
  id          bigint generated always as identity primary key,
  template_id bigint not null references public.material_templates(id) on delete cascade,
  label       text not null,
  value_cents int not null default 0,
  per         text not null check (per in ('iscritto','corso'))
);

-- -----------------------------------------------------------------------------
-- 10. exam_templates + exams + results
-- -----------------------------------------------------------------------------

create table public.exam_templates (
  id          bigint generated always as identity primary key,
  family      text not null check (family in ('certificato','shochu')),
  name        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger exam_templates_touch before update on public.exam_templates
  for each row execute function public.touch_updated_at();

create table public.exams (
  id            bigint generated always as identity primary key,
  corso_id      bigint not null references public.corsi(id) on delete cascade,
  template_id   bigint references public.exam_templates(id) on delete set null,
  family        text not null check (family in ('certificato','shochu')),
  scheduled_at  timestamptz,
  duration_min  int,
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index exams_corso_idx on public.exams (corso_id);
create trigger exams_touch before update on public.exams
  for each row execute function public.touch_updated_at();

create table public.exam_questions (
  id            bigint generated always as identity primary key,
  exam_id       bigint not null references public.exams(id) on delete cascade,
  section       text,
  type          text not null,
  prompt        text not null,
  choices       jsonb not null default '[]'::jsonb,
  correct       jsonb,
  weight        int not null default 1,
  position      int not null default 0
);

create table public.exam_results (
  id            bigint generated always as identity primary key,
  exam_id       bigint not null references public.exams(id) on delete cascade,
  corsista_id   bigint not null references public.corsisti(id) on delete cascade,
  status        text not null check (status in ('passed','retrial','failed')),
  score         numeric(5,2),
  taken_at      timestamptz not null default now(),
  raw           jsonb not null default '{}'::jsonb,
  unique (exam_id, corsista_id)
);
create index exam_results_corsista_idx on public.exam_results (corsista_id);
create index exam_results_exam_idx on public.exam_results (exam_id);

create table public.exam_result_sections (
  id           bigint generated always as identity primary key,
  result_id    bigint not null references public.exam_results(id) on delete cascade,
  name         text not null,
  score        numeric(5,2),
  max_score    numeric(5,2)
);

create table public.exam_live_sessions (
  id            bigint generated always as identity primary key,
  exam_id       bigint not null references public.exams(id) on delete cascade,
  status        text not null,
  started_at    timestamptz,
  ended_at      timestamptz,
  data          jsonb not null default '{}'::jsonb
);

-- -----------------------------------------------------------------------------
-- 11. notifications_log — audit of Resend dispatches
-- -----------------------------------------------------------------------------

create table public.notifications_log (
  id            bigint generated always as identity primary key,
  kind          text not null,
  recipient     text not null,
  subject       text not null,
  status        text not null check (status in ('sent','skipped','failed')),
  provider      text not null,
  provider_id   text,
  params        jsonb not null default '{}'::jsonb,
  sent_at       timestamptz not null default now()
);
create index notifications_log_kind_idx on public.notifications_log (kind);
create index notifications_log_sent_idx on public.notifications_log (sent_at desc);

-- -----------------------------------------------------------------------------
-- 12. rag_documents + rag_chunks — knowledge base for exam grading
-- -----------------------------------------------------------------------------

create table public.rag_documents (
  id            bigint generated always as identity primary key,
  source        text not null,
  title         text not null,
  family        text check (family in ('certificato','shochu','generale')),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index rag_documents_family_idx on public.rag_documents (family);
create trigger rag_documents_touch before update on public.rag_documents
  for each row execute function public.touch_updated_at();

create table public.rag_chunks (
  id            bigint generated always as identity primary key,
  document_id   bigint not null references public.rag_documents(id) on delete cascade,
  chunk_index   int not null,
  content       text not null,
  embedding     vector(1536) not null,
  metadata      jsonb not null default '{}'::jsonb,
  unique (document_id, chunk_index)
);

create index rag_chunks_embedding_idx on public.rag_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.match_rag_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  family_filter text default null
)
returns table (
  id bigint,
  document_id bigint,
  content text,
  similarity float
) language sql stable as $$
  select c.id, c.document_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.rag_chunks c
  join public.rag_documents d on d.id = c.document_id
  where family_filter is null or d.family = family_filter
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- -----------------------------------------------------------------------------
-- 13. settings_kv — dashboard thresholds & app config
-- -----------------------------------------------------------------------------

create table public.settings_kv (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger settings_kv_touch before update on public.settings_kv
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- 14. Row Level Security
-- =============================================================================

alter table public.profiles                  enable row level security;
alter table public.educators                 enable row level security;
alter table public.educator_qualifications   enable row level security;
alter table public.corsisti                  enable row level security;
alter table public.corsi                     enable row level security;
alter table public.corsi_giorni              enable row level security;
alter table public.corsi_sake                enable row level security;
alter table public.corsi_iscrizioni          enable row level security;
alter table public.material_templates        enable row level security;
alter table public.material_template_days    enable row level security;
alter table public.material_template_sakes   enable row level security;
alter table public.material_template_extras  enable row level security;
alter table public.exam_templates            enable row level security;
alter table public.exams                     enable row level security;
alter table public.exam_questions            enable row level security;
alter table public.exam_results              enable row level security;
alter table public.exam_result_sections      enable row level security;
alter table public.exam_live_sessions        enable row level security;
alter table public.notifications_log         enable row level security;
alter table public.rag_documents             enable row level security;
alter table public.rag_chunks                enable row level security;
alter table public.settings_kv               enable row level security;

-- Authenticated users read; staff (admin/manager) write. Spelled out per-table
-- via a DO block for auditability.

do $$
declare t text;
begin
  foreach t in array array[
    'educators','educator_qualifications','corsisti',
    'corsi','corsi_giorni','corsi_sake','corsi_iscrizioni',
    'material_templates','material_template_days','material_template_sakes','material_template_extras',
    'exam_templates','exams','exam_questions','exam_results','exam_result_sections','exam_live_sessions',
    'notifications_log','rag_documents','rag_chunks','settings_kv'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (true);',
                   t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff());',
                   t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff());',
                   t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_staff());',
                   t || '_delete', t);
  end loop;
end$$;

-- profiles: each user sees their own row; staff see all.
create policy profiles_read_self on public.profiles for select
  to authenticated using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update
  to authenticated using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());
create policy profiles_insert_self on public.profiles for insert
  to authenticated with check (id = auth.uid() or public.is_staff());
