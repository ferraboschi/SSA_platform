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

-- Keep the SECURITY DEFINER + pinned search_path hardening from
-- 20260531000000_fix_profiles_rls_recursion.sql (a bare create-or-replace would
-- silently drop it).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('admin', 'manager', 'social', 'accountant');
$$;
