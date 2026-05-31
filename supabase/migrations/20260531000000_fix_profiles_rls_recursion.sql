-- Fix: infinite recursion in profiles RLS (Postgres error 54001).
--
-- The profiles SELECT/UPDATE/INSERT policies call public.is_staff(), which
-- calls public.current_role(), which runs `SELECT role FROM public.profiles`.
-- That inner SELECT re-triggers the profiles policy → is_staff() → current_role()
-- → SELECT profiles → ... infinite recursion → "stack depth limit exceeded".
--
-- Marking the two helper functions SECURITY DEFINER makes their internal read
-- of profiles run with the function owner's privileges, bypassing RLS and
-- breaking the loop. `set search_path = public` is required for SECURITY
-- DEFINER functions (prevents search-path hijacking).

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('admin', 'manager');
$$;
