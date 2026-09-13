-- Least privilege for NEW auth users (audit 2026-09-13).
--
-- profiles.role defaulted to 'manager' and the on_auth_user_created trigger
-- inserted only (id, email): every auth user — including one created through
-- GoTrue's PUBLIC /auth/v1/signup endpoint with the anon key — was born a full
-- manager. Staff accounts are created ONLY by the app's invite flow, which
-- sets the role explicitly right after the trigger fires (supabase-actions.ts
-- inviteStaffAction), so a 'guest' default changes nothing for invited staff
-- and the app already treats 'guest' as zero-capability.
--
-- Pair this with the dashboard setting Authentication → Providers → Email →
-- "Allow new users to sign up" = OFF (the platform never signs users up).

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'social', 'accountant', 'guest'));

alter table public.profiles
  alter column role set default 'guest';

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'guest')
  on conflict (id) do nothing;
  return new;
end$$;

-- Verify: select column_default from information_schema.columns
--   where table_name = 'profiles' and column_name = 'role';  → 'guest'::text
