-- Add two operational roles beyond admin/manager:
--   social      → Dario  (social media / campaigns / communications)
--   accountant  → Luigi  (bookkeeping / economics)
-- All four are "staff" for RLS purposes (they read platform data); capability
-- differences are enforced in the app layer (ROLE_CAPABILITIES / ROLE_VIEWS).

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'social', 'accountant'));

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select public.current_role() in ('admin', 'manager', 'social', 'accountant');
$$;
