-- SECURITY FIX. `purchases` was omitted from the init RLS block (it enables RLS +
-- 4 policies on every other table one-by-one), so it shipped with Row Level
-- Security OFF: the public anon key — embedded in the browser bundle — could
-- read the ENTIRE customer purchase history (2365 rows: who bought what, ticket
-- codes, amounts). This brings it in line with every sibling table, exactly:
--   • RLS on;
--   • any authenticated staff may SELECT (the app's Anomalie page reads it with
--     the session client);
--   • only staff (public.is_staff()) may INSERT/UPDATE/DELETE;
--   • the service-role client (Shopify sync, all server reads) bypasses RLS.
-- After this, an anonymous client can no longer read purchases at all.
alter table public.purchases enable row level security;

drop policy if exists purchases_select on public.purchases;
drop policy if exists purchases_insert on public.purchases;
drop policy if exists purchases_update on public.purchases;
drop policy if exists purchases_delete on public.purchases;

create policy purchases_select on public.purchases
  for select to authenticated using (true);
create policy purchases_insert on public.purchases
  for insert to authenticated with check (public.is_staff());
create policy purchases_update on public.purchases
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy purchases_delete on public.purchases
  for delete to authenticated using (public.is_staff());
